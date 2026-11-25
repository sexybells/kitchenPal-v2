# Ngày chay âm lịch + "Dùng trước khi hỏng" — Design Spec

Date: 2026-11-25 · App: KitchenPal (NestJS backend · Expo mobile) · Status: draft, chờ duyệt

## Ý định

Cả hai tính năng trả lời cùng một câu hỏi hằng ngày: **"hôm nay ăn gì"**, bằng dữ
liệu app đã có sẵn thay vì thêm dữ liệu người dùng phải nhập.

1. **Ngày chay âm lịch** — gia đình ăn chay mùng 1 và rằm được app tự ưu tiên món
   chay đúng ngày, và được nhắc từ chiều hôm trước để kịp đi chợ. Đây là điểm khác
   biệt văn hoá mà app nấu ăn nước ngoài không có.
2. **Dùng trước khi hỏng** — đồ trong tủ sắp hết hạn được ưu tiên dùng: gợi ý xếp
   món "cứu" được đồ sắp hỏng lên trước, kèm một push lúc 16h nói rõ món nào dùng
   hết đồ nào.

Thành công = người dùng thấy gợi ý trên trang chủ "đúng ngày, đúng đồ", và push
16h đủ chính xác để họ không tắt thông báo.

## Hiện trạng (đã đọc code)

- `RecipeSelectionService.select()` (`apps/backend/src/modules/recipes/services/recipe-selection.service.ts`)
  là nguồn xếp hạng chung cho `ai-suggestions/pantry`, `ai-suggestions/preferences`
  và meal auto-fill. Không có AI → `heuristicOrder`: `matchScore` rồi `averageRating`.
  **Hạn dùng không tham gia xếp hạng.**
- `PantryStockLike` chỉ có `id/name/stockState`; `pantry-item.schema` có
  `expiryDate: Date | null`.
- 19/60 món hệ thống gắn tag `"chay"` **và** `"vegetarian"`. `preference-filter`
  lọc cứng theo `diet` tag.
- **Không có tác vụ định kỳ nào**: `AppQueueModule` đăng ký BullMQ nhưng chưa có
  queue nào.
- Loại notification `expiry_alert` đã có đủ (contract, schema, policy push+email,
  label mobile) nhưng **chưa từng được phát**. Toggle `notifications.mealReminders`
  (mặc định `true`) được lưu nhưng **không có gì đọc nó**, và mobile chưa hiển thị nó.
- Server **không lưu múi giờ người dùng**; mọi aggregation đang dùng UTC.
- Push hiện có (chat, budget, invite) dùng chuỗi tiếng Anh hard-code — app
  Vietnamese-first. Spec này localize push của nó theo `user.locale`; sửa push cũ là
  ngoài phạm vi.
- Mobile đã có `addNotificationResponseReceivedListener` → `routeForPushResponse`
  (`apps/mobile/app/_layout.tsx`) để mở màn hình khi bấm push.

## Mục tiêu / Không mục tiêu / Phản mục tiêu

**Mục tiêu**
- Gợi ý (trang chủ, meal auto-fill) ưu tiên món dùng đồ sắp hết hạn, và nói rõ đồ nào.
- Người dùng bật "ăn chay mùng 1 & rằm" thì đúng ngày món chay lên đầu; trang chủ có
  nhãn ngày âm.
- Push 16h: "dùng trước khi hỏng" và "mai là rằm".

**Không mục tiêu (v1)**
- Lịch chay khác ngoài mùng 1 & rằm (chay 4/6/10 ngày, chay tháng Giêng/Vu Lan).
  Thiết kế để mở rộng được (xem Mở rộng), nhưng không làm.
- Nhắc theo giờ người dùng tự chọn — cố định 16h giờ địa phương.
- Gọi AI trong tác vụ nền.
- Gộp/khử trùng push trong một hộ gia đình.
- Localize các push cũ.

**Phản mục tiêu** (chạy được nhưng vẫn là thất bại)
- Gợi ý món dùng đồ **đã quá hạn** — khuyên ăn đồ hỏng.
- Ngày âm lệch 1 ngày so với lịch Việt (dùng lịch Trung Quốc UTC+8).
- Một người nhận ≥2 push "gợi ý món" trong một ngày, hoặc push trùng do nhiều instance.
- Push khi không có gì đáng nói (không có đồ sắp hỏng, không có món dùng được nó).
- Lọc bỏ hẳn món mặn vào ngày chay — người dùng mất lựa chọn.
- Push tiếng Anh tới người dùng `vi`.

## Các cách đã cân nhắc

| | Cách | Đánh đổi | Kết luận |
|---|---|---|---|
| Xếp hạng | **A. Đưa hạn dùng vào `RecipeSelectionService`** | Một cách xếp duy nhất cho trang chủ, auto-fill, push; đổi thứ tự gợi ý hiện tại | **Chọn** |
| | B. Endpoint "use-up" riêng + section riêng | Không đụng gợi ý cũ; nhưng 2 cách xếp có thể mâu thuẫn, thêm 1 section trang chủ | Loại |
| | C. Sắp lại ở mobile | Mobile không có dữ liệu so khớp nguyên liệu | Loại |
| Lịch âm | **Port thuật toán Hồ Ngọc Đức, timezone = 7, ở backend** | ~150 dòng tự giữ; đúng lịch Việt | **Chọn** |
| | Thư viện lịch Trung Quốc (vd. `lunar-javascript`) | Tính UTC+8 → lệch ở vài năm (Tết 1985) | Loại |
| | Tính ở cả mobile và backend | Hai nguồn sự thật có thể lệch | Loại — mobile nhận kết quả qua API |
| Nhắc 16h | **BullMQ job scheduler mỗi giờ, chọn user có giờ địa phương = 16** | Hạ tầng định kỳ đầu tiên; phải có múi giờ + khử trùng | **Chọn** (người dùng chọn làm luôn) |
| | Chỉ hiện trên trang chủ, không push | Rẻ; nhưng chỉ có tác dụng khi người dùng tự mở app | Loại theo quyết định người dùng |

## Thiết kế

### 1. Lịch âm — `apps/backend/src/common/calendar/vietnamese-lunar.ts`

- Hàm thuần `toLunarDate(year, month, day): { day, month, year, isLeapMonth }`,
  port từ thuật toán Hồ Ngọc Đức, **timeZone cố định 7** (lịch Việt quy ước theo
  giờ Hà Nội, kể cả người dùng ở nước ngoài).
- `isVegetarianDay(lunar) = lunar.day === 1 || lunar.day === 15`. Tháng nhuận tính
  như tháng thường (mùng 1/rằm tháng nhuận vẫn là ngày chay).
- "Hôm nay" của người dùng = ngày dương theo **múi giờ người dùng** (mục 3), rồi đổi
  sang âm.
- Test bắt buộc (mốc đã biết): Tết Bính Ngọ = 17/02/2026; Tết Đinh Mùi = 06/02/2027;
  Tết Ất Sửu ở VN = 21/01/1985 (Trung Quốc 20/02/1985 — mốc chứng minh không dùng
  UTC+8); một ngày trong tháng 6 nhuận năm 2025. Builder tự tra và xác minh mốc trước
  khi viết test, không lấy từ trí nhớ.

### 2. Cài đặt người dùng

Thêm vào `UserSettings` + `api-contract/users.ts`:

| Trường | Kiểu | Mặc định | Ghi chú |
|---|---|---|---|
| `observesVegetarianDays` | boolean | `false` | Opt-in. Không phải gia đình nào cũng ăn chay mùng 1/rằm |
| `timeZone` | IANA string | `"Asia/Ho_Chi_Minh"` | Validate bằng `Intl.DateTimeFormat(undefined, { timeZone })`; sai → 400 |

- `observesVegetarianDays` là của **từng người** (như dietary preferences đã đọc
  trong personal scope), kể cả khi xem dữ liệu household.
- Mobile gửi `timeZone` từ `expo-localization` (`getCalendars()[0].timeZone`) qua
  endpoint cập nhật settings hiện có, mỗi lần app khởi động sau đăng nhập, chỉ khi
  khác giá trị server.
- Mobile Settings thêm 2 toggle: **"Ăn chay mùng 1 & rằm"** (`observesVegetarianDays`)
  và **"Gợi ý bữa ăn"** (`mealReminders` — đã có ở backend, chưa có UI). Lưu ý:
  `mealReminders` đang mặc định `true` → khi tính năng lên, người dùng cũ đã bật push
  sẽ bắt đầu nhận push 16h. Đây là hành vi mong muốn; có toggle để tắt.

### 3. Xếp hạng — `RecipeSelectionService`

**Đồ sắp hỏng ("at-risk")**: pantry item có `stockState !== "out"` và
`now < expiryDate ≤ now + 3 ngày`. **Khớp đúng định nghĩa mobile đang hiển thị**
(`apps/mobile/src/features/pantry/stock.ts` `expiryInfo`: `days ≤ 0` = "expired",
`≤ 3` = "soon"), vì `expiryDate` là timestamp (mobile lưu `now + N×24h`), không phải
ngày lịch. Đồ `expiryDate ≤ now` là **đã quá hạn và bị loại** — không bao giờ gợi ý
"dùng hết" một món app đang gắn nhãn "hết hạn". Hằng số `AT_RISK_DAYS = 3`, đặt cạnh
một comment trỏ tới `expiryInfo` để hai bên không lệch. *(Quyết định của người viết.)*

Thay đổi:
- `PantryStockLike` thêm `expiryDate: Date | null`.
- `matchIngredients`: **sắp stock theo `expiryDate` tăng dần (null cuối) trước khi
  so khớp**, để khi có hai "cà chua" (một sắp hỏng, một tươi) thì ingredient trỏ vào
  cái sắp hỏng. Không đổi tập "available"/`matchScore` (chỉ đổi item nào được chọn),
  và thứ tự FIFO này cũng đúng hơn cho vòng nấu → trừ kho. Thiếu bước này `rescues`
  sẽ bị đếm thiếu. *(Quyết định của người viết.)*
- Mỗi `RankedRecipe` thêm `rescues: { pantryItemId, name }[]` = các item at-risk
  được dùng bởi ingredient **không optional** (rau thơm trang trí không tính là "cứu").
- `select()` nhận thêm `context: { now: Date, vegetarianDay: boolean }` do caller
  tính (để tác vụ nền và HTTP dùng chung, và test chủ động được thời điểm), và
  `useAi?: boolean` (mặc định `true`). Tác vụ nền truyền `false` — hiện `select()`
  luôn gọi AI ranker khi có provider, chưa có đường heuristic-only.

**Thứ tự heuristic mới** (khi không có AI):
1. Ngày chay **và** người dùng opt-in: món có tag `chay` lên trước (phân nhóm ổn định).
2. `rescues.length` giảm dần.
3. `matchScore` giảm dần.
4. `averageRating` giảm dần.

**Khi có AI**: thêm `rescueCount` và `isVegetarian` vào payload candidate, và một câu
vào `goal` ("ưu tiên món dùng đồ sắp hết hạn"; ngày chay: "hôm nay là ngày chay").
Sau khi AI trả thứ tự, **áp lại bước 1 (phân nhóm chay) như một ràng buộc cứng**,
giữ thứ tự AI bên trong mỗi nhóm. Rescue không ép cứng sau AI — AI được quyền cân.

Món mặn **không bị lọc** vào ngày chay, chỉ xuống dưới. Nếu người dùng đặt `diet`
= vegetarian thì filter cứ như cũ.

### 4. API — mở rộng response, không thêm endpoint gợi ý

`recipeSuggestionSchema` thêm:
- `rescues: { name: string; expiryDate: string }[]` — đồ sắp hỏng món này dùng hết.
  Đây là danh sách item đầu tiên trong response gợi ý (hiện chỉ có
  `availableCount`/`neededCount`); không lộ `pantryItemId`, theo cách
  `pantryMatch` đã ẩn id ở danh sách `needed`.
- `isVegetarian: boolean`.

`suggestionsResponseSchema` thêm `day`:
```
day: {
  date: "2026-12-04",              // ngày dương theo múi giờ người dùng
  lunar: { day: 15, month: 10, year: 2026, isLeapMonth: false },
  vegetarianDay: boolean,          // ngày 1/15 âm (bất kể opt-in)
  vegetarianPriority: boolean,     // vegetarianDay && observesVegetarianDays
}
```
Áp dụng cho cả `ai-suggestions/pantry` và `ai-suggestions/preferences`.

**Meal auto-fill** (`MealPlansService.autoFill`): hiện gọi `select()` **một lần mỗi
bữa** rồi xoay vòng kết quả qua các slot (`weekStart` + `dayOfWeek` 0–6). Giữ nguyên
số lần gọi (không nhân lên 21 lần gọi AI). Thay đổi duy nhất: với mỗi slot, tính ngày
dương = `weekStart + dayOfWeek`; nếu ngày đó là ngày chay và người dùng opt-in, lấy
món **chay** chưa dùng kế tiếp trong danh sách đã xếp (hết món chay thì quay lại xoay
vòng như cũ). Rescue không xử lý riêng theo slot — nó đã nằm trong thứ tự xếp hạng nên
món "cứu" đồ sắp hỏng tự rơi vào các slot đầu. *(Quyết định của người viết.)*

### 5. Mobile — trang chủ

- **Nhãn ngày** trên đầu section Gợi ý khi `day.vegetarianPriority`:
  "Hôm nay rằm tháng 10 · ưu tiên món chay". Khi `vegetarianDay` mà chưa opt-in: không
  hiện gì (không quảng cáo tính năng người ta không chọn).
- **Thẻ gợi ý** có `rescues.length > 0`: chip "Dùng hết: cà chua, đậu bắp" (tối đa 2
  tên + "+n"), tông `warning-soft`. Món `isVegetarian` có chip "Chay".
- Chuỗi mới vào `src/i18n/locales/vi.ts` và `en.ts`. Tên tháng âm: "tháng Giêng",
  "tháng Chạp", còn lại "tháng N"; tháng nhuận thêm "nhuận".

```
┌ Gợi ý hôm nay ─────────────────────┐
│ 🌕 Hôm nay rằm tháng 10 · ưu tiên chay │
│ ┌──────────┐ ┌──────────┐          │
│ │ [ảnh]    │ │ [ảnh]    │          │
│ │Canh chua │ │Đậu sốt cà│          │
│ │chay      │ │          │          │
│ │[Chay]    │ │[Chay]    │          │
│ │[Dùng hết:│ │          │          │
│ │ cà chua] │ │          │          │
│ └──────────┘ └──────────┘          │
└────────────────────────────────────┘
```

### 6. Nhắc 16h — module mới `apps/backend/src/modules/reminders/`

**Lịch chạy**: queue `meal-reminders`, `upsertJobScheduler("meal-reminders-tick",
{ pattern: "0 * * * *" })` khi module khởi động (idempotent; nhiều instance vẫn chỉ
một scheduler). Không đăng ký trong `NODE_ENV=test`; processor là service gọi được
trực tiếp để test.

**Mỗi tick**:
1. Lấy người dùng đủ điều kiện: `notifications.push && notifications.mealReminders`,
   có ≥1 `pushTokens`, không bị suspend, và **giờ địa phương hiện tại = 16**
   (`REMINDER_HOUR = 16`, tính từ `timeZone`).
2. Với mỗi người, xác định scope như trang chủ (giống ScopeGuard household-preferred):
   household = `user.activeHouseholdId` lưu trên User nếu người đó vẫn là member
   active của household ấy (đã xác minh qua membership), ngược lại personal.
3. Chọn **tối đa một** push theo thứ tự ưu tiên:
   - **Mai là ngày chay** (người dùng opt-in, ngày âm của *ngày mai* là 1/15) →
     type mới `vegetarian_day`. Nội dung kèm 1 món chay top theo `select()` với
     `context.now` = 11h trưa mai, `useAi: false`. **Không có món chay nào qua được
     bộ lọc của người dùng → vẫn gửi**, dùng template không tên món: giá trị chính của
     lời nhắc là *nhớ ngày*, không phải món. *(Quyết định của người viết.)*
     Bấm → trang chủ.
   - **Dùng trước khi hỏng**: chạy `select()` cho hôm nay (`useAi: false`),
     lấy món đầu tiên có `rescues.length ≥ 1`. Ngày chay + opt-in: chỉ xét món chay.
     Không có → **không gửi**. Có → type `expiry_alert`, payload
     `{ recipeId, recipeName, items: string[] }`. Bấm → `/recipe?id=…`.
4. **Khử trùng**: trước khi gửi, insert vào collection `reminder_deliveries`
   `{ userId, localDate, kind }` với unique index `(userId, localDate)`. Insert lỗi
   duplicate → bỏ qua. Gửi lỗi sau khi đã claim → không gửi lại (best-effort, nhất
   quán với `NotificationService`). TTL index 30 ngày.
5. Gửi qua `NotificationService.notify()` (vẫn tạo bản ghi in-app). Lỗi của một
   người không dừng cả tick.

**Nội dung push** (localize theo `user.locale`, template trong module):
- `vi` expiry: "Tối nay nấu {món}?" / "Dùng hết {đồ 1}, {đồ 2} trước khi hỏng."
- `vi` chay: "Mai là rằm tháng {n}" (hoặc "mùng 1") / "Gợi ý: {món chay}. Đi chợ
  chiều nay nhé." — không có món: "Nhớ chuẩn bị đồ chay, đi chợ chiều nay nhé."
- `en` tương đương.

**Policy channel**: `expiry_alert` hiện là push + **email**. Push 16h hằng ngày qua
email là quá ồn → tác vụ này chỉ truyền `delivery.push`, không truyền `delivery.email`
(NotificationService chỉ gửi kênh có content). Thêm `vegetarian_day: { push: true,
email: false }` vào `CHANNELS`, enum contract, schema, và label + route mobile.

**Quy mô**: v1 duyệt tuần tự theo trang (cursor) người dùng đủ điều kiện trong giờ
đó. Đủ cho quy mô hiện tại; ghi chú điểm cần chia batch nếu tick > vài phút.

## Lỗi & biên

- `timeZone` không hợp lệ đã lưu (dữ liệu cũ) → fallback `Asia/Ho_Chi_Minh`, log warn.
- Item không có `expiryDate` → không bao giờ at-risk.
- Redis không có ở dev → scheduler không chạy; HTTP vẫn chạy bình thường.
- Đổi giờ mùa hè (DST, người dùng nước ngoài): có thể có ngày không có giờ 16 hoặc
  có hai; khử trùng theo `localDate` chặn trùng, ngày mất giờ thì bỏ qua — chấp nhận.

## Kiểm thử

- **Lịch âm**: unit với các mốc ở mục 1.
- **Selection**: at-risk loại đồ quá hạn và đồ `out`; ingredient optional không tính
  rescue; thứ tự 4 bậc; phân nhóm chay áp lại sau thứ tự AI; không lọc món mặn.
- **Contract**: zod cho `rescues`, `isVegetarian`, `day`, settings mới, type
  `vegetarian_day`.
- **Reminders**: chọn đúng user theo giờ địa phương (UTC+7 và một tz khác); không gửi
  khi không có rescue; chay-ngày-mai thắng expiry; claim trùng → không gửi lần 2;
  không gửi email; lỗi một user không dừng tick; locale vi/en.
- **Mobile**: nhãn ngày chỉ hiện khi `vegetarianPriority`; chip "Dùng hết" cắt tên
  đúng; 2 toggle mới gọi update settings; route push `vegetarian_day` và
  `expiry_alert`; đồng bộ `timeZone` chỉ khi khác.

## Mở rộng sau (không làm v1)

- Lịch chay nhiều ngày: đổi `observesVegetarianDays: boolean` thành
  `vegetarianDays: number[]` (ngày âm) với preset. `isVegetarianDay` đã tách riêng để
  việc này chỉ đụng một hàm.
- Giờ nhắc tuỳ chọn; AI cho push; một push chung cho cả hộ.

## Để builder quyết

- Cấu trúc file trong module `reminders`, tên class/hàm, cách test với BullMQ.
- Cách lấy người dùng đủ điều kiện hiệu quả (query trên `user_settings` theo
  `timeZone` list hay lọc trong app).
- Câu chữ cuối cùng của push và nhãn (giữ đúng ý ở trên).

## Câu hỏi mở

- Người thuộc nhiều household: tác vụ nền không có token, nên dùng
  `activeHouseholdId` lưu trên User (đã xác minh membership active) — đúng household
  mà app đang hiển thị, không phải membership tham gia gần nhất. Vấn đề gốc vẫn treo
  từ trước ("multi-household active-switch endpoint"); khi nó được giải và
  `activeHouseholdId` đổi theo lựa chọn của người dùng, tác vụ nền tự đổi theo.
