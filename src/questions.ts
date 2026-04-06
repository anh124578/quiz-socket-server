import { db } from "./firebase";

export type Topic = "react-native" | "javascript" | "general";
export type Difficulty = "easy" | "medium" | "hard";

export type ServerQuestion = {
  id: string;
  topic: Topic;
  difficulty: Difficulty;
  type: "single";
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  timeLimitSec?: number;
  image?: any;
};

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mapDocToQuestion(
  doc: FirebaseFirestore.QueryDocumentSnapshot
): ServerQuestion {
  const q = doc.data();

  return {
    id: doc.id,
    topic: q.topic,
    difficulty: q.difficulty,
    type: "single",
    question: q.question,
    options: q.options ?? [],
    correctIndex: q.correctIndex ?? 0,
    explanation: q.explanation ?? "",
    timeLimitSec: q.timeLimitSec,
    image: q.image ?? undefined,
  };
}

function takeRandom<T>(arr: T[], count: number): T[] {
  return shuffle(arr).slice(0, Math.min(count, arr.length));
}

export async function getQuestionsFromFirestore(
  total = 10
): Promise<ServerQuestion[]> {
  const snap = await db
    .collection("quizQuestions")
    .where("active", "==", true)
    .get();

  const all = snap.docs.map(mapDocToQuestion);

  const easyPool = all.filter((q) => q.difficulty === "easy");
  const mediumPool = all.filter((q) => q.difficulty === "medium");
  const hardPool = all.filter((q) => q.difficulty === "hard");

  const pickedEasy = takeRandom(easyPool, 4);
  const usedEasyIds = new Set(pickedEasy.map((q) => q.id));

  const pickedMedium = takeRandom(
    mediumPool.filter((q) => !usedEasyIds.has(q.id)),
    3
  );
  const usedMediumIds = new Set(pickedMedium.map((q) => q.id));

  const pickedHard = takeRandom(
    hardPool.filter((q) => !usedEasyIds.has(q.id) && !usedMediumIds.has(q.id)),
    3
  );

  let picked: ServerQuestion[] = [
    ...shuffle(pickedEasy),
    ...shuffle(pickedMedium),
    ...shuffle(pickedHard),
  ];

  if (picked.length < total) {
    const usedIds = new Set(picked.map((q) => q.id));
    const remain = shuffle(all.filter((q) => !usedIds.has(q.id)));
    picked = [...picked, ...remain.slice(0, total - picked.length)];
  }

  return picked.slice(0, total);
}