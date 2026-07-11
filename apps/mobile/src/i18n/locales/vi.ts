/** Vietnamese copy (default locale). Keep keys flat-ish and grouped by area. */
export const vi = {
  common: {
    appName: "KitchenPal",
    continue: "Tiếp tục",
    back: "Quay lại",
    skip: "Bỏ qua",
    next: "Tiếp",
    cancel: "Huỷ",
    save: "Lưu",
    signOut: "Đăng xuất",
    retry: "Thử lại",
    loading: "Đang tải…",
    or: "hoặc",
    email: "Email",
    password: "Mật khẩu",
    displayName: "Tên hiển thị",
    showPassword: "Hiện mật khẩu",
    hidePassword: "Ẩn mật khẩu",
  },
  errors: {
    network: "Không có kết nối mạng. Vui lòng kiểm tra và thử lại.",
    server: "Đã xảy ra lỗi. Vui lòng thử lại sau.",
    invalidResponse: "Phản hồi từ máy chủ không hợp lệ.",
    sessionExpired: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    invalidCredentials: "Email hoặc mật khẩu không đúng.",
    validation: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.",
    rateLimited: "Bạn thao tác quá nhanh. Vui lòng thử lại sau giây lát.",
    emailTaken: "Email này đã được sử dụng.",
  },
  language: {
    title: "Chọn ngôn ngữ",
    subtitle: "Bạn có thể đổi lại bất cứ lúc nào trong Cài đặt.",
    vietnamese: "Tiếng Việt",
    english: "English",
  },
  onboarding: {
    slide1Title: "Quản lý bếp gia đình",
    slide1Body: "Theo dõi tủ lạnh, hạn dùng và lên thực đơn trong một nơi.",
    slide2Title: "Nấu thông minh, đỡ lãng phí",
    slide2Body: "Gợi ý món từ nguyên liệu sẵn có và tự cập nhật tủ đồ.",
    getStarted: "Bắt đầu",
  },
  auth: {
    loginTitle: "Chào mừng trở lại",
    loginSubtitle: "Đăng nhập để tiếp tục quản lý bếp của bạn.",
    signUpTitle: "Tạo tài khoản",
    signUpSubtitle: "Bắt đầu hành trình bếp núc gọn gàng hơn.",
    login: "Đăng nhập",
    signUp: "Đăng ký",
    noAccount: "Chưa có tài khoản?",
    haveAccount: "Đã có tài khoản?",
    forgotPassword: "Quên mật khẩu?",
    continueWithGoogle: "Tiếp tục với Google",
    continueWithApple: "Tiếp tục với Apple",
    unlockWithBiometrics: "Mở khoá bằng sinh trắc học",
    recoverTitle: "Đặt lại mật khẩu",
    recoverSubtitle: "Nhập email, chúng tôi sẽ gửi liên kết đặt lại.",
    sendResetLink: "Gửi liên kết",
    resetSent: "Đã gửi liên kết đặt lại tới email của bạn.",
  },
  tabs: {
    home: "Trang chủ",
    pantry: "Tủ đồ",
    add: "Thêm",
    meals: "Bữa ăn",
    shopping: "Đi chợ",
  },
  home: {
    greeting: "Xin chào",
    expiringSoon: "Sắp hết hạn",
    todaysMeals: "Bữa ăn hôm nay",
    suggestions: "Gợi ý cho bạn",
  },
  menu: {
    spending: "Chi tiêu",
    household: "Gia đình & Trò chuyện",
    notifications: "Thông báo",
    settings: "Cài đặt",
    paywall: "Nâng cấp Pro",
  },
  states: {
    emptyTitle: "Chưa có gì ở đây",
    emptyBody: "Nội dung sẽ hiển thị khi có dữ liệu.",
    errorTitle: "Đã xảy ra lỗi",
    errorBody: "Không thể tải dữ liệu. Vui lòng thử lại.",
  },
  placeholder: {
    comingSoon: "Sắp ra mắt",
    body: "Màn hình này sẽ được xây dựng ở giai đoạn sau.",
  },
} as const;

/** Widen the literal `vi` shape so other locales can supply different strings
 * while keeping the exact key structure. */
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};
export type TranslationBundle = DeepStringify<typeof vi>;
