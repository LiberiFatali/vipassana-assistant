# Tasks: Vipassana UCENLIST Knowledge Skill

## Overview

Add Vietnamese language support to the existing `vipassana-ucenlist-knowledge` skill and finalize it as a complete bilingual knowledge base for a Vipassana chatbot agent.

**File to modify:** `.agents/skills/vipassana-ucenlist-knowledge/SKILL.md`

---

## Task 1: Update Frontmatter Description

**File:** `.agents/skills/vipassana-ucenlist-knowledge/SKILL.md`

Update the `description` field in the YAML frontmatter to include Vietnamese trigger phrases so the skill is activated for Vietnamese-language queries too.

**Add to description:**
```
Also use this skill for Vietnamese queries about: thiền Vipassana, UCENLIST, 
đăng ký khóa thiền, S.N. Goenka, thiền 10 ngày, Dhamma Virocana, Dhamma Vutthi,
khóa thiền, hành thiền, quy tắc giới luật, thời khóa biểu.
```

---

## Task 2: Add Vietnamese Sections to SKILL.md

For each of the 12 content sections currently in English, add a corresponding Vietnamese section immediately after it. Use the heading convention `## N-VI. [Vietnamese Title]`.

### 2.1 — Section 1-VI: Giới thiệu UCENLIST

Add after `## 1. ABOUT UCENLIST`:

```markdown
## 1-VI. GIỚI THIỆU UCENLIST

**Tên đầy đủ:** Trung tâm Giáo dục Kỹ năng Sống UNESCO (UCENLIST)

**Loại hình:** Tổ chức phi lợi nhuận, đơn vị thành viên của Hội UNESCO Việt Nam

**Thành lập:** 18/10/2012 (Quyết định số 77/QĐ-LH của Chủ tịch Hội)

**Sứ mệnh:** Tổ chức các hoạt động liên quan đến tư vấn, hướng dẫn và phát triển kỹ năng sống — chuyên về các kỹ năng tâm lý, xã hội và cá nhân cho mọi đối tượng, đặc biệt là sinh viên, trí thức trẻ và doanh nhân.

**Trọng tâm chính:** Tổ chức các khóa thiền Vipassana theo truyền thống của S.N. Goenka và U Ba Khin.

**Lịch sử:**
- Năm 2013 (năm đầu hoạt động): Tổ chức thành công 5 khóa thiền tập trung 10 ngày
- Học viên đến từ Hà Nội, các tỉnh thành và bạn bè quốc tế
- Từ năm 2015: Mở rộng hoạt động đến TP. Hồ Chí Minh

**Sứ mệnh dài hạn:** Tổ chức các khóa thiền Vipassana phi lợi nhuận để phổ biến thiền định như một nghệ thuật sống thiết thực, nâng cao sức khỏe tâm thần và thúc đẩy những thay đổi tích cực trong gia đình và xã hội.

**Email:** info@ucenlist.org
**Website:** https://ucenlist.org
```

### 2.2 — Section 2-VI: Thiền Vipassana là gì?

Add after `## 2. WHAT IS VIPASSANA?`:

```markdown
## 2-VI. THIỀN VIPASSANA LÀ GÌ?

**Định nghĩa:** Vipassana, có nghĩa là "nhìn sự vật đúng như bản chất thực của chúng," là một trong những kỹ thuật thiền định cổ xưa nhất của Ấn Độ. Kỹ thuật này được Đức Phật Cồ-đàm tái khám phá hơn 2.500 năm trước và được truyền dạy như một phương thuốc chữa lành phổ quát — một Nghệ thuật sống.

**Mục đích:** Là con đường tự chuyển hóa thông qua tự quan sát — tập trung vào mối liên hệ sâu xa giữa tâm và thân, được trải nghiệm trực tiếp qua sự chú tâm có kỷ luật vào các cảm thọ thân xác.

**Mục tiêu:** Loại bỏ hoàn toàn những bất tịnh trong tâm trí và đạt đến hạnh phúc tối thượng của giải thoát hoàn toàn.

**Tính chất phi tôn giáo:** Kỹ thuật này không liên quan đến bất kỳ tôn giáo có tổ chức nào. Ai cũng có thể thực hành tự do, bất kỳ lúc nào, bất kỳ nơi đâu, không phân biệt chủng tộc, cộng đồng hay tín ngưỡng.

**Cơ chế hoạt động:**
- Mỗi khi một bất tịnh (tức giận, sợ hãi, tham ái) phát sinh trong tâm, hai điều xảy ra đồng thời:
  1. Hơi thở mất đi nhịp điệu bình thường
  2. Một phản ứng sinh hóa bắt đầu trong cơ thể, tạo ra các cảm thọ
- Bằng cách quan sát hơi thở và cảm thọ thân xác, ta quan sát trực tiếp các bất tịnh trong tâm
- Qua thực hành bền vững, các bất tịnh mất đi sức mạnh và tan biến

**Ba bước tu tập:**
1. **Giới (Sila):** Kiêng cữ các hành động gây hại cho người khác — đây là nền tảng
2. **Định (Samadhi):** Tập trung sự chú ý vào hơi thở tự nhiên để làm tâm an tịnh và sắc bén
3. **Tuệ (Panna):** Quan sát các cảm thọ khắp cơ thể với tâm bình thản — đây chính là Vipassana
```

### 2.3 — Section 4-VI: Tiểu sử S.N. Goenka

Add after `## 4. S.N. GOENKA — BIOGRAPHY`:

```markdown
## 4-VI. S.N. GOENKA — TIỂU SỬ

**Tên đầy đủ:** Satya Narayan Goenka (S.N. Goenka)

**Thân thế:**
- Gốc Ấn Độ, sinh ra và lớn lên ở Myanmar (Miến Điện)
- Học thiền Vipassana từ thầy Sayagyi U Ba Khin sau 14 năm tu tập
- Bắt đầu dạy thiền Vipassana tại Ấn Độ năm **1969**
- Thu hút hàng nghìn người từ mọi tầng lớp xã hội, mọi đẳng cấp và tôn giáo

**Tầm ảnh hưởng toàn cầu:**
- Trong gần 45 năm, đã dạy hàng trăm nghìn người tại các khóa học ở Ấn Độ và khắp nơi trên thế giới
- Thiết lập các trung tâm thiền tại châu Á, châu Âu, châu Mỹ, châu Phi và Australasia

**Bài phát biểu tại Liên Hợp Quốc (năm 2000):**
- Mùa hè năm 2000, ông phát biểu tại "Hội nghị Thượng đỉnh Hòa bình Thiên niên kỷ" tại Đại hội đồng Liên Hợp Quốc ở New York
- Những trích dẫn tiêu biểu:
  - *"Thay vì cải đạo người ta từ tôn giáo có tổ chức này sang tôn giáo có tổ chức khác, chúng ta nên cố gắng cải đạo người ta từ khổ đau sang hạnh phúc, từ trói buộc sang giải thoát, từ tàn nhẫn sang bi mẫn."*
  - *"Hòa bình thế giới không thể đạt được nếu không có hòa bình trong từng cá nhân."*

**Giải thưởng:** Giải thưởng Padma của Tổng thống Ấn Độ năm 2012

**Viên tịch:** Tháng 9 năm 2013, hưởng thọ 89 tuổi
```

### 2.4 — Section 6-VI: Giới luật

Add after `## 6. THE CODE OF DISCIPLINE`:

```markdown
## 6-VI. GIỚI LUẬT

### Năm Giới (dành cho tất cả học viên)
Tất cả học viên tham dự khóa thiền Vipassana phải giữ năm giới sau trong suốt khóa học:

1. Không giết hại sinh vật
2. Không trộm cắp
3. Không quan hệ tình dục
4. Không nói dối
5. Không sử dụng chất gây say (rượu, ma túy...)

### Thêm ba giới cho học viên cũ
(Những người đã hoàn thành một khóa thiền với S.N. Goenka hoặc một giáo viên phụ):

6. Không ăn sau buổi trưa (được uống trà không sữa hoặc nước trái cây vào giờ giải lao 17:00)
7. Không giải trí và trang trí bản thân
8. Không nằm giường cao hoặc sang trọng

### Tịnh Khẩu Cao Quý (Noble Silence)
- Tất cả học viên giữ Tịnh Khẩu Cao Quý từ đầu khóa đến sáng ngày cuối cùng
- Tịnh Khẩu = im lặng về thân, khẩu và tâm
- Không giao tiếp với bạn đồng tu bằng bất kỳ hình thức nào (cử chỉ, ngôn ngữ ký hiệu, ghi chú — đều bị cấm)
- Học viên có thể nói chuyện với giáo viên và ban quản lý khi cần thiết

### Phân biệt Nam Nữ
- Nam và nữ hoàn toàn tách biệt trong suốt khóa học
- Các cặp đôi (đã kết hôn hay chưa) không được tiếp xúc với nhau
- Điều này cũng áp dụng cho bạn bè và thành viên gia đình

### Các Quy tắc Khác
- **Liên lạc bên ngoài:** Không thư từ, điện thoại, hay khách thăm. Nộp điện thoại cho ban quản lý
- **Đọc và viết:** Không được phép
- **Âm nhạc:** Không nhạc cụ, radio, v.v.
- **Thuốc lá:** Không hút thuốc hay nhai thuốc lá
- **Thực phẩm:** Bữa ăn chay đơn giản được cung cấp; không ăn kiêng đặc biệt; không nhịn ăn
- **Trang phục:** Đơn giản, kín đáo, thoải mái; không mặc quần áo chật, trong suốt, hở hang

### Tài chính Khóa học
- Các khóa học hoạt động hoàn toàn dựa trên **sự tự nguyện cúng dường**
- Không thu phí giảng dạy, ăn ở
- Chỉ nhận cúng dường từ những người đã hoàn thành ít nhất một khóa thiền 10 ngày
- Học viên lần đầu có thể cúng dường vào ngày cuối hoặc bất cứ lúc nào sau đó
- Không có giáo viên hay ban tổ chức nào nhận thù lao
```

### 2.5 — Section 7-VI: Thời khóa biểu

Add after `## 7. THE DAILY TIMETABLE`:

```markdown
## 7-VI. THỜI KHÓA BIỂU HÀNG NGÀY

| Thời gian | Hoạt động |
|-----------|-----------|
| 4:00 | Chuông báo thức buổi sáng |
| 4:30 - 6:30 | Thiền trong thiền đường hoặc phòng riêng |
| 6:30 - 8:00 | Nghỉ ăn sáng |
| 8:00 - 9:00 | Thiền tập thể trong thiền đường |
| 9:00 - 11:00 | Thiền trong thiền đường hoặc phòng riêng (theo hướng dẫn của giáo viên) |
| 11:00 - 12:00 | Nghỉ ăn trưa |
| 12:00 - 13:00 | Nghỉ ngơi và phỏng vấn với giáo viên |
| 13:00 - 14:30 | Thiền trong thiền đường hoặc phòng riêng |
| 14:30 - 15:30 | Thiền tập thể trong thiền đường |
| 15:30 - 17:00 | Thiền trong thiền đường hoặc phòng riêng (theo hướng dẫn của giáo viên) |
| 17:00 - 18:00 | Giờ uống trà |
| 18:00 - 19:00 | Thiền tập thể trong thiền đường |
| 19:00 - 20:15 | Pháp thoại của Thầy (video ghi âm của S.N. Goenka) |
| 20:15 - 21:00 | Thiền tập thể trong thiền đường |
| 21:00 - 21:30 | Giải đáp thắc mắc trong thiền đường |
| 22:00 | Về phòng nghỉ — Tắt đèn |

**Tổng thời gian thiền:** Khoảng 10 tiếng mỗi ngày
```

### 2.6 — Section 8-VI: Hỏi & Đáp

Add after `## 8. QUESTIONS AND ANSWERS (FAQ)`:

```markdown
## 8-VI. HỎI & ĐÁP

**H: Tại sao khóa học kéo dài 10 ngày?**
Đ: Mười ngày là mức tối thiểu. Kinh nghiệm qua nhiều thế hệ cho thấy ít hơn 10 ngày không đủ để tâm trí lắng đọng và làm việc sâu. Truyền thống xưa, Vipassana được dạy trong các khóa tu kéo dài bảy tuần.

**H: Tôi sẽ thiền bao nhiêu tiếng mỗi ngày?**
Đ: Khoảng mười tiếng mỗi ngày. Ngày bắt đầu lúc 4:00 sáng và kéo dài đến 9:00 tối, với các giờ nghỉ và thư giãn thường xuyên. Mỗi tối có bài pháp thoại của S.N. Goenka qua video.

**H: Khóa học sử dụng ngôn ngữ gì?**
Đ: Giảng dạy thông qua các bản ghi âm của S.N. Goenka (tiếng Anh hoặc tiếng Hindi) với phiên dịch sang ngôn ngữ địa phương. Băng dịch thuật có ở hầu hết các ngôn ngữ lớn. Ngôn ngữ thường không phải là rào cản.

**H: Khóa học tốn bao nhiêu tiền?**
Đ: Không có phí cho việc giảng dạy, ăn ở. Tất cả các khóa thiền Vipassana trên toàn thế giới đều hoạt động trên cơ sở cúng dường tự nguyện. Nếu bạn thấy lợi ích, bạn có thể cúng dường vào cuối khóa để hỗ trợ các khóa học trong tương lai.

**H: Tôi không thể ngồi kiết già. Tôi có thể thiền không?**
Đ: Hoàn toàn được. Có ghế cho những ai không thể ngồi thoải mái trên sàn do tuổi tác hay vấn đề thể chất.

**H: Phụ nữ có thai có được tham gia không?**
Đ: Có. Nhiều phụ nữ đến tham gia đặc biệt trong thời kỳ mang thai. Họ cần đảm bảo thai kỳ ổn định trước khi đăng ký. Thức ăn bổ sung được cung cấp và họ thực hành theo cách thư giãn hơn.

**H: Tại sao khóa học được tiến hành trong im lặng?**
Đ: Tất cả học viên giữ "tịnh khẩu cao quý" — im lặng về thân, khẩu và tâm — trong chín ngày đầu. Ngày thứ mười, lời nói được nối lại như cách tái hòa nhập cuộc sống bình thường.

**H: Vipassana có thể chữa bệnh thể chất hay tâm thần không?**
Đ: Học Vipassana với mục đích chữa bệnh là một sai lầm và không bao giờ thành công. Nhiều bệnh tật có nguyên nhân từ sự xáo trộn nội tâm, và nếu xáo trộn được loại bỏ, bệnh có thể thuyên giảm — nhưng đây là kết quả phụ, không phải mục tiêu.

**H: Tôi có cần phải là Phật tử để thực hành Vipassana không?**
Đ: Không. Người từ nhiều tôn giáo và không có tôn giáo đều thấy khóa học có ích. Vipassana là nghệ thuật sống, không phải tôn giáo.
```

### 2.7 — Section 9-VI: Đăng ký & Trung tâm

Add after `## 9. OUR CENTERS AND COURSE REGISTRATION`:

```markdown
## 9-VI. ĐĂNG KÝ KHÓA HỌC & TRUNG TÂM

UCENLIST vận hành hai trung tâm chính tại Việt Nam:

### UCENLIST HN (Hà Nội)
- **Tên Trung tâm Thiền:** Dhamma Virocana
- **Website trung tâm:** https://virocana.vridhamma.org/vi
- **Lịch khóa học:** https://schedule.vridhamma.org/vi/courses/virocana
- **Địa chỉ:** Đội 2, thôn Minh Tân, xã Minh Trí, huyện Sóc Sơn, Hà Nội
- **Điện thoại:** +84 966-894-936

### UCENLIST HCM (TP. Hồ Chí Minh)
- **Tên Trung tâm Thiền:** Dhamma Vutthi
- **Website trung tâm:** https://vutthi.vridhamma.org/vi
- **Lịch khóa học:** https://schedule.vridhamma.org/vi/courses/vutthi
- **Địa chỉ:** 112, đường 628, ấp Trại Đèn, Phước Hiệp, Củ Chi, TP. Hồ Chí Minh
- **Điện thoại:** +84 942-255-050

### Dhamma Pala 2026 (Địa điểm đặc biệt)
- Link đăng ký: https://khaosat.me/i/ucenlist-dhamma-pala-2026

### Cách Đăng Ký Khóa Học
1. Truy cập trang Lịch khóa học: https://ucenlist.org/course-schedule
2. Chọn trung tâm (Hà Nội hoặc TP. Hồ Chí Minh)
3. Truy cập trang lịch của trung tâm (liên kết ở trên)
4. Đọc toàn bộ thông tin và làm theo hướng dẫn đăng ký
5. Liên hệ trung tâm qua điện thoại nếu có thắc mắc về tổ chức
```

### 2.8 — Section 10-VI: Thông tin liên hệ

Add after `## 10. CONTACT INFORMATION`:

```markdown
## 10-VI. THÔNG TIN LIÊN HỆ

**Email (chung):** info@ucenlist.org

**Để đăng ký khóa học:**
- Truy cập https://ucenlist.org/courses
- Đọc toàn bộ thông tin và làm theo hướng dẫn

**Chi nhánh I UCENLIST (Hà Nội):**
- Địa chỉ: Đội 2, thôn Minh Tân, xã Minh Trí, huyện Sóc Sơn, Hà Nội
- Điện thoại: +84 966-894-936

**Chi nhánh II UCENLIST (TP. Hồ Chí Minh):**
- Địa chỉ: 112, đường 628, ấp Trại Đèn, Phước Hiệp, Củ Chi, TP. Hồ Chí Minh
- Điện thoại: +84 942-255-050
```

### 2.9 — Section 11-VI: Nguyên tắc chatbot

Add after `## 11. KEY PRINCIPLES FOR THE CHATBOT`:

```markdown
## 11-VI. NGUYÊN TẮC CHO CHATBOT

Khi trả lời người dùng, hãy giữ những nguyên tắc sau:

1. **Giọng điệu từ bi:** Trả lời với sự ấm áp, kiên nhẫn và chân thành — phù hợp với các giá trị của Vipassana (tình thương, từ bi, bình thản)
2. **Phi tôn giáo:** Nhấn mạnh rằng Vipassana dành cho tất cả mọi người, bất kể tôn giáo, nguồn gốc hay niềm tin
3. **Trung thực về giới hạn:** Không hứa hẹn quá mức. Vipassana không phải là phương pháp chữa bệnh; hướng người dùng có vấn đề sức khỏe tâm thần nghiêm trọng đến các chuyên gia
4. **Khuyến khích cam kết đúng đắn:** Một khóa học 10 ngày đầy đủ là tối thiểu; giải thích tại sao tham dự không đủ làm suy yếu trải nghiệm
5. **Hướng dẫn đăng ký:** Hướng người dùng đến trung tâm phù hợp dựa trên vị trí (Hà Nội: UCENLIST HN; TP. HCM: UCENLIST HCM)
6. **Hoàn toàn miễn phí:** Luôn làm rõ rằng các khóa học hoàn toàn miễn phí (chỉ cúng dường sau khi hoàn thành)
```

---

## Task 3: Add Language Detection Section

Add a new final section to the skill that instructs the chatbot agent how to handle language switching:

```markdown
## 13. LANGUAGE BEHAVIOR GUIDE (For Chatbot Agent)

### Language Detection
- If the user writes in **Vietnamese**: respond entirely in Vietnamese using the Vietnamese sections (1-VI through 12-VI)
- If the user writes in **English**: respond entirely in English using the English sections (1 through 12)
- If the user mixes languages or is unclear: default to **Vietnamese** (since UCENLIST primarily serves Vietnamese users)

### Tone in Both Languages
- **Vietnamese**: Warm, respectful, use "bạn" (you, informal) or "quý học viên" (valued student) as appropriate. Keep language natural and accessible.
- **English**: Calm, welcoming, informative. Mirror the philosophical tone of S.N. Goenka's writings.

### Key Vietnamese Phrases to Recognize
- Thiền Vipassana / thiền định
- Khóa thiền 10 ngày / khóa học
- Đăng ký / ghi danh
- Giới luật / quy tắc
- Thời khóa biểu
- S.N. Goenka / Thầy Goenka
- Dhamma Virocana / Dhamma Vutthi
- UCENLIST / trung tâm thiền
```

---

## Verification

After completing all tasks, verify:

- [x] `SKILL.md` frontmatter `description` includes Vietnamese trigger phrases
- [x] All 12 Vietnamese content sections exist (1-VI through 12-VI)
- [x] Section 13 (Language Behavior Guide) exists
- [x] Vietnamese content is accurate, natural, and not machine-translated
- [x] English content unchanged
- [x] File reads cleanly as a markdown document
