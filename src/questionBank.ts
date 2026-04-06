export type Topic = "react-native" | "javascript" | "general";
export type Difficulty = "easy" | "medium" | "hard";

export type Question = {
  id: string;
  topic: Topic;
  difficulty: Difficulty;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  timeLimitSec?: number;
};

export const questionBank: Question[] = [
  // =========================
  // React Native - EASY
  // =========================
  {
    id: "rn-e-1",
    topic: "react-native",
    difficulty: "easy",
    question: "React Native dùng để làm gì?",
    options: ["Làm game PC", "Làm app mobile", "Làm website", "Làm AI"],
    correctIndex: 1,
    explanation: "React Native chủ yếu để build app mobile iOS/Android.",
  },
  {
    id: "rn-e-2",
    topic: "react-native",
    difficulty: "easy",
    question: "Component cơ bản để bố cục trong React Native là gì?",
    options: ["View", "Div", "Section", "Container"],
    correctIndex: 0,
  },
  {
    id: "rn-e-3",
    topic: "react-native",
    difficulty: "easy",
    question: "Để hiển thị chữ trong React Native dùng component nào?",
    options: ["Label", "Text", "P", "Span"],
    correctIndex: 1,
  },
  {
    id: "rn-e-4",
    topic: "react-native",
    difficulty: "easy",
    question: "Props dùng để xử lý sự kiện bấm trong Pressable là gì?",
    options: ["onClick", "onTap", "onPress", "onSubmit"],
    correctIndex: 2,
  },
  {
    id: "rn-e-5",
    topic: "react-native",
    difficulty: "easy",
    question: "Thư viện router mày đang dùng trong project là gì?",
    options: ["react-router", "expo-router", "next/router", "vue-router"],
    correctIndex: 1,
  },

  // =========================
  // React Native - MEDIUM
  // =========================
  {
    id: "rn-m-1",
    topic: "react-native",
    difficulty: "medium",
    question: "Component nào dùng để hiển thị chữ?",
    options: ["View", "Div", "Text", "Span"],
    correctIndex: 2,
  },
  {
    id: "rn-m-2",
    topic: "react-native",
    difficulty: "medium",
    question: "Hook nào dùng để quản lý state trong function component?",
    options: ["useMemo", "useEffect", "useState", "useCallback"],
    correctIndex: 2,
  },
  {
    id: "rn-m-3",
    topic: "react-native",
    difficulty: "medium",
    question: "Để chạy side-effect khi component render xong, dùng hook nào?",
    options: ["useEffect", "useState", "useRef", "useMemo"],
    correctIndex: 0,
  },
  {
    id: "rn-m-4",
    topic: "react-native",
    difficulty: "medium",
    question: "FlatList phù hợp nhất để render kiểu dữ liệu nào?",
    options: ["Một item đơn", "Danh sách dài", "Form nhập", "Modal"],
    correctIndex: 1,
  },
  {
    id: "rn-m-5",
    topic: "react-native",
    difficulty: "medium",
    question: "Để điều hướng sang màn khác trong expo-router thường dùng gì?",
    options: ["router.push()", "window.location", "navigateTo()", "history.go()"],
    correctIndex: 0,
  },

  // =========================
  // React Native - HARD
  // =========================
  {
    id: "rn-h-1",
    topic: "react-native",
    difficulty: "hard",
    question: "useMemo dùng để làm gì?",
    options: [
      "Tạo state",
      "Tạo ref",
      "Cache giá trị tính toán giữa các lần render",
      "Chạy effect theo thời gian",
    ],
    correctIndex: 2,
  },
  {
    id: "rn-h-2",
    topic: "react-native",
    difficulty: "hard",
    question: "Prop nào của FlatList giúp tối ưu khi danh sách rất dài?",
    options: ["numColumns", "initialNumToRender", "style", "ListHeaderComponent"],
    correctIndex: 1,
  },
  {
    id: "rn-h-3",
    topic: "react-native",
    difficulty: "hard",
    question: "Key extractor trong FlatList dùng để làm gì?",
    options: [
      "Đổi màu item",
      "Tạo key ổn định cho từng item",
      "Tăng FPS",
      "Tự động sắp xếp list",
    ],
    correctIndex: 1,
  },
  {
    id: "rn-h-4",
    topic: "react-native",
    difficulty: "hard",
    question: "useRef thường dùng đúng nhất trong trường hợp nào?",
    options: [
      "Lưu state và re-render mỗi lần đổi",
      "Lưu giá trị không cần re-render và giữ giữa các lần render",
      "Chạy effect",
      "Tạo memo component",
    ],
    correctIndex: 1,
  },
  {
    id: "rn-h-5",
    topic: "react-native",
    difficulty: "hard",
    question: "Để đọc param từ route trong expo-router dùng hook nào?",
    options: ["useParams()", "useLocalSearchParams()", "useQuery()", "useRouteParams()"],
    correctIndex: 1,
  },

  // =========================
  // JavaScript - EASY
  // =========================
  {
    id: "js-e-1",
    topic: "javascript",
    difficulty: "easy",
    question: "typeof [] trong JS trả về gì?",
    options: ["array", "object", "list", "undefined"],
    correctIndex: 1,
    explanation: "Array là object trong JS.",
  },
  {
    id: "js-e-2",
    topic: "javascript",
    difficulty: "easy",
    question: "Câu lệnh nào dùng để khai báo hằng số?",
    options: ["var", "let", "const", "static"],
    correctIndex: 2,
  },
  {
    id: "js-e-3",
    topic: "javascript",
    difficulty: "easy",
    question: "Toán tử so sánh chặt (strict equality) là gì?",
    options: ["==", "===", "!=", "<>"],
    correctIndex: 1,
  },
  {
    id: "js-e-4",
    topic: "javascript",
    difficulty: "easy",
    question: "Kết quả của '2' + 2 trong JS là gì?",
    options: ["4", "22", "NaN", "undefined"],
    correctIndex: 1,
    explanation: "Chuỗi + số => nối chuỗi.",
  },
  {
    id: "js-e-5",
    topic: "javascript",
    difficulty: "easy",
    question: "Array method nào dùng để thêm phần tử vào cuối mảng?",
    options: ["push", "pop", "shift", "unshift"],
    correctIndex: 0,
  },

  // =========================
  // JavaScript - MEDIUM
  // =========================
  {
    id: "js-m-1",
    topic: "javascript",
    difficulty: "medium",
    question: "Khác nhau chính giữa let và var là gì?",
    options: [
      "let có scope block, var có scope function",
      "var nhanh hơn let",
      "let chỉ dùng cho số",
      "var không khai báo được",
    ],
    correctIndex: 0,
  },
  {
    id: "js-m-2",
    topic: "javascript",
    difficulty: "medium",
    question: "Promise có mấy trạng thái chính?",
    options: ["1", "2", "3", "4"],
    correctIndex: 2,
    explanation: "pending, fulfilled, rejected.",
  },
  {
    id: "js-m-3",
    topic: "javascript",
    difficulty: "medium",
    question: "map() trả về gì?",
    options: ["Một mảng mới", "Chính mảng cũ", "Một số", "Một object"],
    correctIndex: 0,
  },
  {
    id: "js-m-4",
    topic: "javascript",
    difficulty: "medium",
    question: "Dùng cách nào để clone mảng nông (shallow) nhanh?",
    options: ["arr.clone()", "[...arr]", "arr.copy()", "clone(arr)"],
    correctIndex: 1,
  },
  {
    id: "js-m-5",
    topic: "javascript",
    difficulty: "medium",
    question: "JSON.parse dùng để làm gì?",
    options: [
      "Chuyển object thành string",
      "Chuyển string JSON thành object",
      "Mã hoá string",
      "So sánh object",
    ],
    correctIndex: 1,
  },

  // =========================
  // JavaScript - HARD
  // =========================
  {
    id: "js-h-1",
    topic: "javascript",
    difficulty: "hard",
    question: "Closure là gì?",
    options: [
      "Hàm gọi lại (callback)",
      "Hàm nhớ scope bên ngoài của nó",
      "Một kiểu dữ liệu",
      "Một toán tử",
    ],
    correctIndex: 1,
  },
  {
    id: "js-h-2",
    topic: "javascript",
    difficulty: "hard",
    question: "Event loop xử lý cái gì?",
    options: [
      "Tối ưu CSS",
      "Quản lý call stack và task queue",
      "Tăng tốc CPU",
      "Compile JS thành C++",
    ],
    correctIndex: 1,
  },
  {
    id: "js-h-3",
    topic: "javascript",
    difficulty: "hard",
    question: "Khi nào microtask chạy?",
    options: [
      "Sau mỗi render UI",
      "Trước macrotask tiếp theo, sau khi call stack rỗng",
      "Chỉ khi setTimeout",
      "Chỉ khi fetch",
    ],
    correctIndex: 1,
  },
  {
    id: "js-h-4",
    topic: "javascript",
    difficulty: "hard",
    question: "Khác nhau chính giữa == và === là gì?",
    options: [
      "== so sánh cả kiểu và giá trị",
      "=== có type coercion",
      "=== so sánh chặt cả kiểu và giá trị",
      "Không có khác nhau",
    ],
    correctIndex: 2,
  },
  {
    id: "js-h-5",
    topic: "javascript",
    difficulty: "hard",
    question: "Hoisting xảy ra với cái nào chắc chắn?",
    options: ["Function declaration", "Arrow function", "Class expression", "Import dynamic"],
    correctIndex: 0,
  },

  // =========================
  // General
  // =========================
  {
    id: "gen-e-1",
    topic: "general",
    difficulty: "easy",
    question: "HTTP viết tắt của gì?",
    options: [
      "HyperText Transfer Protocol",
      "High Transfer Text Program",
      "Hyper Tool Transfer Process",
      "Host Transfer Protocol",
    ],
    correctIndex: 0,
  },
  {
    id: "gen-m-1",
    topic: "general",
    difficulty: "medium",
    question: "REST API thường trả dữ liệu dạng gì?",
    options: ["CSV", "JSON", "XML-only", "TXT"],
    correctIndex: 1,
  },
  {
    id: "gen-h-1",
    topic: "general",
    difficulty: "hard",
    question: "Big-O của binary search là gì?",
    options: ["O(n)", "O(log n)", "O(n log n)", "O(1)"],
    correctIndex: 1,
  },
  {
    id: "gen-e-2",
    topic: "general",
    difficulty: "easy",
    question: "CPU là viết tắt của gì?",
    options: [
      "Central Processing Unit",
      "Computer Personal Unit",
      "Core Process Utility",
      "Control Program Unit",
    ],
    correctIndex: 0,
  },
  {
    id: "gen-e-3",
    topic: "general",
    difficulty: "easy",
    question: "HTML dùng để làm gì?",
    options: ["Tạo cấu trúc trang web", "Tạo cơ sở dữ liệu", "Tạo app Android", "Tạo hệ điều hành"],
    correctIndex: 0,
  },
  {
    id: "gen-m-2",
    topic: "general",
    difficulty: "medium",
    question: "Git dùng để làm gì?",
    options: ["Quản lý phiên bản code", "Thiết kế UI", "Chạy database", "Tạo server vật lý"],
    correctIndex: 0,
  },
  {
    id: "gen-m-3",
    topic: "general",
    difficulty: "medium",
    question: "API là gì?",
    options: ["Giao diện lập trình ứng dụng", "Một loại virus", "Một ngôn ngữ lập trình", "Một hệ điều hành"],
    correctIndex: 0,
  },
  {
    id: "gen-h-2",
    topic: "general",
    difficulty: "hard",
    question: "HTTPS khác HTTP ở điểm chính nào?",
    options: ["Có mã hoá TLS/SSL", "Nhanh hơn gấp đôi", "Không cần internet", "Chỉ dùng cho mobile"],
    correctIndex: 0,
  },
  {
    id: "gen-h-3",
    topic: "general",
    difficulty: "hard",
    question: "SQL injection thường tấn công vào đâu?",
    options: ["Cơ sở dữ liệu qua input không được lọc", "Card màn hình", "Pin điện thoại", "Bluetooth"],
    correctIndex: 0,
  },
];

// NOTE: quizData của anh có 1 câu type="multi" (js-10). Server hiện tại chưa hỗ trợ multi,
// nên mình không đưa vào questionBank để khỏi chấm sai.
