 

 

 

 

REQUIREMENT DETAILS

 

Task Management Platform

(Jira + Confluence Inspired)

 



 

 

 



 

Mục lục

 

1. Mục tiêu sản phẩm

1.1 Tầm nhìn

Xây dựng một nền tảng quản lý công việc + quản lý tri thức nội bộ hợp nhất, lấy cảm hứng từ Jira (task tracking) và Confluence (knowledge base), giúp team:

•        Lập kế hoạch, theo dõi tiến độ, quản trị sprint/release.

•        Cộng tác tài liệu kỹ thuật/vận hành/chính sách.

•        Liên kết chặt chẽ giữa Issue và Document để tránh thất thoát thông tin.

 

1.2 Mục tiêu

•        Giảm thời gian theo dõi công việc thủ công.

•        Tăng tính minh bạch tiến độ và trách nhiệm.

•        Chuẩn hóa quy trình làm việc theo team/space.

•        Tập trung hóa tài liệu nội bộ, dễ tìm kiếm và tái sử dụng.

 

2. Phạm vi dự án

2.1 In Scope (Bắt buộc)

1. 	Quản lý user, vai trò, xác thực phân quyền.

2. 	Space Management — đơn vị tổ chức lớn nhất của hệ thống.

3. 	Board (Kanban) — quản lý công việc theo cột trạng thái, kéo-thả card.

4. 	Backlog & Sprint (Scrum) — lập kế hoạch sprint, quản lý backlog.

5. 	Quản lý Issue (Task/Bug/Story/Epic/Sub-task).

6. 	Workflow trạng thái + transition rules.me

7. 	Knowledge base (Page/Sub-page) kiểu Confluence.

8. 	Comment/mention/notification.

9. 	Tìm kiếm toàn cục (issues + docs).

10.  Dashboard/báo cáo cơ bản.

11.  Audit log và quản trị hệ thống.

 

2.2 Out of Scope (giai đoạn sau) 



Hạng mục

Lý do loại khỏi scope

AI assistant tự động viết tài liệu/tóm tắt

Tính năng nâng cao, cần dữ liệu training nội bộ, ưu tiên sau MVP

Gantt/Portfolio nâng cao

Phức tạp về UX, team hiện tại chưa có nhu cầu cấp thiết

Marketplace plugin bên thứ ba

App nội bộ không cần ecosystem mở rộng trong giai đoạn đầu

Mobile native app (iOS/Android)

Người dùng nội bộ chủ yếu trên desktop; web responsive đủ dùng

Calendar sync nâng cao

Phụ thuộc external API (Google/Outlook), ưu tiên thấp

3. Vai trò người dùng

Vai trò

Mô tả

Phạm vi quyền

Super Admin

Quản trị toàn nền tảng

Full system

Space Admin (Workspace Admin)

Toàn quyền trong space: cấu hình workflow, board, mời member

Full trong space

Member

Tạo & xử lý task, viết tài liệu

CRUD trong space được cấp

Viewer

Chỉ xem nội dung

Read-only

 

4. Phân loại ưu tiên yêu cầu

Mức độ

Ký hiệu

Ý nghĩa

Must-have

P0

Bắt buộc để go-live MVP. Không có tính năng này, hệ thống không thể sử dụng được.

Should-have

P1

Nên có ngay sau MVP. Tăng giá trị đáng kể nhưng không block go-live.

Could-have

P2

Nâng cao, đưa vào roadmap các phase sau.

 

5. Functional Requirements (FR)

5.1 Authentication & Authorization

FR ID

Mô tả

Priority

FR-AUTH-001

Đăng nhập/đăng xuất bằng email + password.

P0

FR-AUTH-002

Refresh token, session timeout tự động.

P0

FR-AUTH-003

Quên mật khẩu/đặt lại mật khẩu qua email.

P0

FR-AUTH-004

SSO (Google/Microsoft/OIDC).

P1

FR-AUTH-005

RBAC enforced theo Space.

P0

FR-AUTH-006

Chính sách mật khẩu: độ dài tối thiểu 8 ký tự, phải có chữ hoa/số/ký tự đặc biệt, lockout sau 5 lần sai.

P0

FR-AUTH-007

MFA (TOTP/Email OTP) cho tài khoản quản trị.

P1

FR-AUTH-008

Quản lý session: xem danh sách thiết bị đang đăng nhập, có thể revoke từng session.

P1

FR-AUTH-009

Deactivate/suspend user khi nhân viên nghỉ việc; tự động revoke toàn bộ session.

P0

FR-AUTH-010

Timezone setting per user; lưu UTC, hiển thị theo locale.

P0

 

Acceptance Criteria — Authentication

•        User không có quyền không thể truy cập API/UI protected (trả về HTTP 403).

•        Token hết hạn phải bị từ chối và yêu cầu đăng nhập lại (HTTP 401).

•        User bị deactivate không thể đăng nhập; session hiện tại bị revoke trong vòng tối đa 60 giây.

•        Tài khoản bị lockout sau 5 lần nhập sai mật khẩu liên tiếp; unlock sau 15 phút hoặc qua email.

•        Password reset link hết hạn sau 30 phút và chỉ dùng được một lần.

 



Nhóm chức năng

Làm gì

Làm thế nào

Đăng nhập / Đăng xuất 

Cho phép user đăng nhập bằng email + password và đăng xuất khỏi hệ thống.

Xây dựng API login, logout; kiểm tra email/password; tạo access token và refresh token; frontend làm màn Login và xử lý lỗi đăng nhập.

Refresh token / Session timeout

Duy trì phiên đăng nhập hợp lệ và tự động yêu cầu đăng nhập lại khi token hết hạn.

Thiết kế bảng sessions hoặc refresh tokens; access token có thời hạn ngắn, refresh token có thời hạn dài hơn; middleware kiểm tra token trên API protected.

Quên / đặt lại mật khẩu

Cho phép user đặt lại mật khẩu qua email khi quên mật khẩu.

Tạo API forgot-password, reset-password; gửi email chứa reset link; token reset hết hạn sau 30 phút và chỉ dùng một lần.

Chính sách mật khẩu

Bắt buộc mật khẩu đủ mạnh và khóa tài khoản khi nhập sai nhiều lần.

Validate mật khẩu tối thiểu 8 ký tự, có chữ hoa/số/ký tự đặc biệt; lưu số lần login sai; lock tài khoản sau 5 lần sai và unlock sau 15 phút hoặc qua email.

RBAC theo Space

Kiểm soát quyền truy cập theo vai trò của user trong từng Space.

Thiết kế bảng roles, permissions, space_memberships; backend kiểm tra quyền trước khi cho truy cập API; frontend ẩn/hiện menu theo quyền.

 

Deactivate user

Khi nhân viên nghỉ việc, user bị khóa và không thể tiếp tục dùng hệ thống.

Admin cập nhật trạng thái user thành deactivated; backend từ chối login; revoke toàn bộ session hiện tại trong tối đa 60 giây.

Timezone setting

Lưu timezone riêng cho từng user để hiển thị ngày giờ đúng theo locale.

Database lưu datetime dạng UTC; user profile lưu timezone; frontend convert UTC sang timezone của user khi hiển thị.

SSO / MFA / Session management

Bổ sung đăng nhập Google/Microsoft, MFA cho admin và quản lý thiết bị đăng nhập.

Đưa vào phase sau; tích hợp OIDC cho SSO, TOTP/Email OTP cho MFA, thêm màn quản lý session và revoke từng thiết bị.



5.2 Space Management

Space là đơn vị tổ chức lớn nhất trong hệ thống. Mỗi Space đại diện cho một team, phòng ban hoặc dự án. Sau khi tạo Space, người dùng chọn loại (Kanban hoặc Scrum) để kích hoạt Board hoặc Backlog tương ứng.

 

5.2.1 Tạo và cấu hình Space

FR ID

Mô tả

Priority

FR-SPC-001

Tạo Space với: tên, key (VD: AL-TASK), mô tả, avatar/màu sắc.

P0

FR-SPC-002

Chọn loại Space khi tạo: Kanban hoặc Scrum. Loại quyết định các tab hiển thị (Board / Backlog).

P0

FR-SPC-003

Mời user vào Space qua email; email invite có expiry 7 ngày.

P0

FR-SPC-004

Quản lý thành viên Space: xem danh sách, gán role (Space Admin / Member / Viewer), xóa member.

P0

FR-SPC-005

Cài đặt Space: đổi tên, đổi key, cập nhật mô tả, xóa Space.

P0

FR-SPC-006

Archive Space thay vì xóa; Space bị archive vẫn truy cập được nhưng ẩn khỏi danh sách chính.

P0

FR-SPC-007

Multi-space switch: user có thể thuộc nhiều Space, chuyển qua lại dễ dàng từ sidebar.

P1

FR-SPC-008

Components và labels chuẩn theo Space.

P1

FR-SPC-009

Version/Release management trong Space.

P1

 

5.2.2 Cấu trúc sau khi tạo Space

Sau khi tạo Space, hệ thống khởi tạo cấu trúc tương ứng:

 

Loại Space

Tab hiển thị

Mô tả

Kanban

Board, List, Summary, Pages

Board Kanban với các cột trạng thái (To Do / In Progress / Done). Không có Sprint.

Scrum

Backlog, Board, List, Summary, Pages

Backlog để lên kế hoạch sprint. Board hiển thị issue trong sprint đang chạy.







 

Acceptance Criteria — Space Management

•        User được mời nhận email với link join; link hết hạn sau 7 ngày.

•        Space Admin có thể xem toàn bộ danh sách member và thay đổi role.

•        Space key phải duy nhất trong hệ thống; không chấp nhận ký tự đặc biệt, chỉ chấp nhận chữ hoa, số, dấu gạch chân.

•        Sau khi tạo Space Kanban, tab Board hiển thị ngay với 3 cột mặc định: To Do, In Progress, Done.

•        Sau khi tạo Space Scrum, tab Backlog hiển thị ngay; tab Board chỉ hiển thị sau khi có Sprint đang chạy.

•        Archive Space ẩn khỏi danh sách chính nhưng vẫn truy cập được qua URL; Super Admin có thể restore.

 



Nhóm chức năng

Làm gì

Làm thế nào

Tạo Space

Cho phép tạo Space với tên, key và access.

Thiết kế bảng spaces; tạo API create space; validate tên/key không trùng; frontend làm form Create Space.

Mời user vào Space

Cho phép Space Admin mời thành viên bằng email và gán role.

Tạo bảng space_invites; sinh invite token hết hạn sau 7 ngày; gửi email invite; khi user bấm link thì tạo membership.

Quản lý member

Cho phép admin xem danh sách thành viên và thay đổi role.

Tạo API list/add/update/remove member; backend kiểm tra quyền Space Admin; frontend làm màn Member Management.

Team / Group trong Space

Cho phép gom user vào team/group để dễ phân quyền và mention.

Tạo bảng teams, team_members; frontend có màn tạo team, thêm/xóa member khỏi team.

Multi-space switch

Cho phép user chuyển nhanh giữa nhiều Space mà họ được cấp quyền.

API trả danh sách Space của user; frontend làm Space Switcher ở sidebar/header.

Archive Space

Cho phép archive Space khi không còn sử dụng nhưng vẫn giữ dữ liệu.

Không xóa vật lý; cập nhật trạng thái archived; ẩn khỏi danh sách mặc định nhưng vẫn cho admin xem/restore nếu cần.



5.3 Board — Kanban

Board là giao diện công việc chính của Space Kanban (và của Sprint đang chạy trong Space Scrum). Hiển thị issue dưới dạng card, sắp xếp theo cột trạng thái.

 

FR ID

Mô tả

Priority

FR-BRD-001

Hiển thị Board với các cột trạng thái; mặc định: To Do, In Progress, Done.

P0

FR-BRD-002

Kéo-thả card giữa các cột để chuyển trạng thái issue.

P0

FR-BRD-003

Thêm/sửa/xóa cột trạng thái trên Board (Space Admin).

P0

FR-BRD-004

Xem nhanh thông tin card: title, assignee, priority, label, due date.

P0

FR-BRD-005

Mở chi tiết issue khi click vào card.

P0

FR-BRD-006

Tạo issue nhanh trên Board (+ Create trong cột).

P0

FR-BRD-007

Filter Board theo: assignee, priority, label, issue type.

P0

FR-BRD-008

List View: xem issue dưới dạng danh sách (thay thế Board khi cần).

P0

FR-BRD-009

WIP limit cho cột Kanban: cảnh báo khi vượt giới hạn.

P1

FR-BRD-010

Swimlane theo assignee/epic/priority.

P1

 

Acceptance Criteria — Board

•        Kéo-thả card cập nhật status ngay lập tức; nếu workflow rule vi phạm, card trả về vị trí cũ và hiển thông báo rõ lý do.

•        Thêm cột mới cập nhật Workflow; xóa cột có issue phải chuyển issue sang cột khác trước.

•        WIP limit: cột hiển thị cảnh báo màu đỏ khi vượt giới hạn; không block hard.

•        Filter Board hoạt động độc lập, kết hợp được nhiều điều kiện cùng lúc.

 



Nhóm chức năng

Làm gì

Làm thế nào

Tạo project/space theo template

Cho phép tạo project/space theo Scrum, Kanban hoặc Basic.

Khi tạo mới, user chọn template; backend sinh sẵn workflow, status, board và cấu hình mặc định tương ứng.

Project / Space key

Mỗi project/space có key riêng để sinh mã issue như PROJ-123.

Lưu key trong bảng projects hoặc spaces; validate key unique; dùng key khi tạo issue sequence.

Project settings

Cho phép cấu hình tên, mô tả, key, trạng thái archive và các setting liên quan.

Tạo API update settings; frontend làm màn Project/Space Settings; chỉ admin có quyền chỉnh sửa.

Thành viên và role theo project/space

Quản lý thành viên và quyền riêng trong từng project/space.

Dùng bảng project_memberships hoặc space_memberships; mỗi user có role riêng theo từng project/space.

Components và labels

Cho phép phân loại issue theo component và label.

Tạo bảng components, labels; frontend cho phép tạo/sửa/xóa label/component trong settings.

Version / Release management

Quản lý phiên bản release cho project.

Tạo bảng versions hoặc releases; issue có thể gán vào version; dùng cho báo cáo release sau này.



5.4 Backlog & Sprint — Scrum

Backlog là danh sách toàn bộ issue của Space Scrum chưa được đưa vào sprint. Sprint Planning giúp team chọn issue từ Backlog đưa vào Sprint.

 

FR ID

Mô tả

Priority

FR-SPR-001

Hiển thị Backlog: danh sách issue chưa vào sprint, sắp xếp theo priority.

P0

FR-SPR-002

Tạo Sprint mới với tên, mục tiêu, ngày bắt đầu, ngày kết thúc.

P0

FR-SPR-003

Kéo-thả issue từ Backlog vào Sprint (Sprint Planning).

P0

FR-SPR-004

Start Sprint: khởi chạy sprint, hiển thị issue trên Board.

P0

FR-SPR-005

Close Sprint: hiển thị danh sách issue chưa done, cho chọn chuyển sang Backlog hoặc Sprint tiếp theo.

P0

FR-SPR-006

Story point / estimation per issue trong Sprint.

P0

FR-SPR-007

Tạo issue trực tiếp từ Backlog.

P0

FR-SPR-008

Di chuyển issue giữa các Sprint hoặc đưa về Backlog.

P0

FR-SPR-009

Burndown chart và velocity chart theo sprint.

P1

FR-SPR-010

Báo cáo sprint: số issue hoàn thành, tổng story point, velocity.

P1

 

Acceptance Criteria — Backlog & Sprint

•        Backlog hiển thị tất cả issue chưa thuộc sprint nào, bao gồm cả issue từ sprint đã đóng.

•        Chỉ có 1 Sprint được phép ở trạng thái Active cùng lúc.

•        Close Sprint: nhắc nhở issue chưa done trước khi đóng; không thể đóng nếu còn issue ở trạng thái In Progress mà không xác nhận.

•        Story point tính tổng tự động trong Sprint header.

•        Kéo-thả issue trong Backlog để sắp xếp thứ tự ưu tiên.



Nhóm chức năng

Làm gì

Làm thế nào

CRUD issue

Cho phép tạo, xem, sửa, xóa issue gồm Task, Bug, Story, Epic, Sub-task.

Thiết kế bảng issues, issue_types, priorities, statuses; xây API CRUD; frontend làm Issue List, Issue Detail, Create/Edit Issue Modal.

Required fields

Bắt buộc các trường như summary, description, assignee, priority, status, due date.

Validate ở backend và frontend; nếu thiếu field thì trả lỗi 400 Bad Request kèm field cụ thể.

Mã issue duy nhất

Mỗi issue có mã duy nhất dạng PROJ-123 và không tái sử dụng.

Tạo bảng issue_sequences; mỗi project/space có sequence riêng; khi tạo issue thì tăng sequence và sinh issue key.

Parent-child relation

Hỗ trợ quan hệ Epic → Story → Sub-task.

Thêm parent_id vào bảng issues; validate loại issue cha/con hợp lệ; UI hiển thị cây issue hoặc linked hierarchy.

Bulk edit / bulk transition

Cho phép cập nhật nhiều issue cùng lúc.

Tạo API bulk update; giới hạn tối đa 100 issue/lần; backend xử lý transaction và ghi activity log cho từng issue.

Filter / sort / list

Cho phép lọc issue theo assignee, status, priority, sprint, label.

API list issue hỗ trợ query params; tạo index database cho các field hay lọc; frontend làm Filter Panel.

Watchers / Followers

User có thể theo dõi issue để nhận notification khi issue thay đổi.

Tạo bảng issue_watchers; API add/remove watcher; khi issue update thì notification service gửi thông báo cho watchers.

Custom fields

Cho phép tạo field tùy chỉnh theo space/project.

Tạo bảng custom_fields, custom_field_values; phase sau triển khai UI cấu hình field.

Issue linking

Cho phép link issue với nhau như blocks, relates to, duplicates.

Tạo bảng issue_links; mỗi link có source_issue_id, target_issue_id, link_type.

Time tracking

Cho phép estimate và log work cho issue.

Thêm field estimate; tạo bảng worklogs; UI có tab Worklog để nhập thời gian làm việc.

Import CSV

Cho phép import danh sách issue từ file CSV.

Upload CSV, validate dữ liệu, preview lỗi, sau đó tạo issue bằng background job.

 

5.5 Issue/Task Management

FR ID

Mô tả

Priority

FR-ISS-001

CRUD issue: Task, Bug, Story, Epic, Sub-task.

P0

FR-ISS-002

Trường bắt buộc: summary, description, assignee, priority, status, due date.

P0

FR-ISS-003

Parent-child relation: Epic → Story → Sub-task.

P0

FR-ISS-004

Bulk edit, bulk transition status.

P0

FR-ISS-005

Filter/sort/list theo assignee/status/priority/sprint/label.

P0

FR-ISS-006

Watchers & followers (nhận notification khi issue thay đổi).

P0

FR-ISS-007

Custom fields theo space.

P1

FR-ISS-008

Issue linking: blocks, relates to, duplicates.

P1

FR-ISS-009

Time tracking: estimate + log work.

P1

FR-ISS-010

Import issue từ CSV.

P1

 

Acceptance Criteria — Issue Management

•        Mỗi issue có mã duy nhất dạng SPACEKEY-123; mã không được tái sử dụng kể cả khi issue bị xóa.

•        Lịch sử thay đổi issue lưu đầy đủ: ai thay đổi, thời điểm, trường nào thay đổi, giá trị cũ/mới.

•        Bulk edit tối đa 100 issues trong một thao tác.

•        Xóa issue thực hiện soft-delete; admin có thể restore trong 30 ngày.

 



Nhóm chức năng

Làm gì

Làm thế nào

Cấu hình status

Cho phép tạo các trạng thái như To Do, In Progress, In Review, Done và status tùy chỉnh.

Tạo bảng statuses, workflows, workflow_statuses; frontend làm màn Workflow Settings.

Transition rule

Chỉ role phù hợp mới được chuyển trạng thái issue.

Tạo bảng workflow_transitions, transition_rules; backend kiểm tra role trước khi cho đổi status.

Validator

Bắt buộc điền field trước khi chuyển trạng thái.

Tạo transition_validators; trước khi transition, backend kiểm tra field bắt buộc như assignee, due date, resolution.

Condition transition

Chỉ cho transition nếu user là assignee, reporter hoặc thuộc team phù hợp.

Tạo rule condition theo assignee/reporter/team; backend kiểm tra điều kiện tại transition service.

Post-function

Sau khi chuyển trạng thái, hệ thống tự động thực hiện hành động phụ.

Sau transition thành công, gọi post-function như notify, set done date, auto-assign, ghi activity log.

Workflow scheme

Gán workflow khác nhau theo issue type.

Tạo bảng workflow_schemes; map issue type với workflow tương ứng.n

Board rollback khi lỗi

Nếu kéo card sai rule, card quay lại vị trí cũ và hiện lỗi.

Frontend gọi API transition khi drag-drop; nếu API trả lỗi thì rollback UI và hiển thị toast/message.



5.6 Workflow & Status Engine

FR ID

Mô tả

Priority

FR-WF-001

Cấu hình trạng thái: To Do / In Progress / In Review / Done và trạng thái tùy chỉnh.

P0

FR-WF-002

Transition theo rule: chỉ role phù hợp mới chuyển được.

P0

FR-WF-003

Validator: bắt buộc điền field trước khi chuyển trạng thái.

P0

FR-WF-004

Condition transition theo assignee/reporter/team.

P1

FR-WF-005

Post-function tự động: notify, set date, auto-assign.

P1

FR-WF-006

Workflow scheme gán theo issue type.

P1

 

Acceptance Criteria — Workflow

•        User không có quyền transition sẽ nhận lỗi rõ ràng, không thể kéo card trên board.

•        Validator chặn transition nếu field bắt buộc chưa điền, hiển thị thông báo field nào còn thiếu.



Nhóm chức năng

Làm gì

Làm thế nào

Kanban board

Hiển thị issue theo cột trạng thái và cho kéo-thả card.

Tạo bảng boards, board_columns; mỗi column map với status; drag-drop gọi API transition.

Scrum backlog

Quản lý danh sách issue chưa đưa vào sprint.

Issue chưa thuộc sprint active sẽ nằm trong backlog; frontend cho phép sort, filter và kéo issue vào sprint.

Sprint planning

Cho phép tạo sprint và thêm issue vào sprint.

Tạo bảng sprints, sprint_issues; API create sprint, add/remove issue khỏi sprint.

Start sprint

Bắt đầu sprint với danh sách issue đã chọn.

Cập nhật sprint status thành active; validate chỉ có một active sprint trong cùng board nếu cần.

Close sprint

Kết thúc sprint và xử lý issue chưa Done.

Khi close sprint, UI hiển thị issue chưa Done; user chọn chuyển về backlog hoặc sprint tiếp theo.

Story point

Cho phép estimate độ phức tạp của issue.

Thêm field story_point trong issue; chỉ cho nhập số hợp lệ; dùng cho velocity/burndown chart.

Burndown / Velocity chart

Hiển thị báo cáo sprint cơ bản.

Dùng dữ liệu sprint, story point và status history để vẽ chart; có thể làm ở phase P1.

WIP limit

Cảnh báo khi số issue trong cột Kanban vượt giới hạn.

Lưu wip_limit cho board column; frontend hiển thị cảnh báo màu đỏ khi vượt, nhưng không block hard.

Swimlane

Nhóm issue theo assignee, epic hoặc priority.

API trả dữ liệu group theo tiêu chí; frontend render board theo swimlane.

 

5.7 Document Management (Confluence-like)

FR ID

Mô tả

Priority

FR-DOC-001

Mỗi Space có một khu vực Pages riêng để lưu tài liệu nội bộ.

P0

FR-DOC-002

Tạo, xem, chỉnh sửa, xóa page trong Space.

P0

FR-DOC-003

Hỗ trợ tổ chức page theo cây phân cấp cha-con (giới hạn tối đa để tránh cấu trúc quá phức tạp).

P0

FR-DOC-004

Rich text editor: heading, bold/italic, table, checklist, code block, media, mention user.

P0

FR-DOC-005

Auto-save draft mỗi 30 giây trong quá trình soạn thảo.

P0

FR-DOC-006

Page versioning: mỗi lần publish tạo version mới.

P0

FR-DOC-007

Xem lịch sử version và khôi phục version cũ.

P1

FR-DOC-008

Phân quyền xem/sửa page theo Space role: Space Admin, Member, Viewer theo scope: public, private, workspace

P0

FR-DOC-009

Đặt page ở chế độ public trong space hoặc private/role-based.

P0

FR-DOC-010

Template tài liệu: Meeting Note, Requirement, Technical Design, Runbook, Decision Log.

P1

FR-DOC-011

Comment ở cấp page; inline comment và resolve comment.

P1

FR-DOC-012

Trạng thái page: Draft, Published, Archived, In Review.

P1

FR-DOC-013

Archive page thay vì xóa vĩnh viễn.

P1

 

Acceptance Criteria — Document

•        Có thể xem lịch sử từng version và khôi phục version cũ; version hiện tại không bị mất khi restore.

•        Page private không xuất hiện trong kết quả search/list với user không có quyền.

•        Autosave draft mỗi 30 giây; khi user quay lại trang đang soạn dở, hệ thống cho tiếp tục từ bản draft gần nhất.

•        User có role Member trở lên mới có quyền chỉnh sửa page, Viewer chỉ được phép xem.

•        Khi page bị xóa, chỉ Space Admin hoặc Super Admin có quyền khôi phục trong thời gian retention.

 

Nhóm chức năng

Làm gì

Làm thế nào

Space/Page

Cho phép tạo không gian tài liệu và page theo team/project.

Tạo bảng pages, spaces; page thuộc Space; frontend có Page Tree bên trái.

Page tree

Cho phép tổ chức page theo cây cha-con.

Thêm parent_id trong bảng pages; hỗ trợ kéo-thả đổi thứ tự nếu cần.

Tạo/sửa/xóa page

User có quyền có thể tạo, chỉnh sửa và xóa page.

API CRUD page; xóa page nên dùng soft-delete; kiểm tra permission trước khi thao tác.

Rich text editor

Hỗ trợ heading, table, checklist, code block, media, mention.

Dùng editor như TipTap/ProseMirror; lưu content dạng JSON hoặc HTML sanitized.

Page versioning

Lưu lịch sử version và cho restore version cũ.

Tạo bảng page_versions; mỗi lần publish tạo version mới; restore bằng cách tạo version mới từ bản cũ.

Permission page

Kiểm soát page public/private/role-based.

Tạo bảng page_permissions; backend kiểm tra quyền ở API list/detail/search.

Template page

Cung cấp template meeting note, RFC, runbook, ADR.

Tạo bảng page_templates; khi tạo page, user chọn template để fill nội dung mẫu.

Inline/page comment

Cho phép comment trực tiếp trên page hoặc đoạn nội dung.

Tạo bảng page_comments; lưu vị trí comment nếu là inline comment.

Page status

Quản lý trạng thái draft, in review, published.

Thêm field status; autosave draft mỗi 30 giây; publish mới tạo version chính thức.



5.8 Liên kết Issue — Document

FR ID

Mô tả

Priority

FR-LINK-001

Cho phép gắn một hoặc nhiều issue vào một document/page.

P0

FR-LINK-002

Cho phép gắn một hoặc nhiều document/page vào một issue.

P0

FR-LINK-003

Hiển thị backlinks: issue đang tham chiếu page nào.

P0

FR-LINK-004

Macro nhúc danh sách issue vào page theo filter.

P1

FR-LINK-005

Tạo issue trực tiếp từ nội dung page (highlight text → create issue).

P1

 



Nhóm chức năng

Làm gì

Làm thế nào

Gắn issue vào page

Cho phép liên kết issue với document/page.

Tạo bảng issue_page_links; API add/remove link; UI hiển thị linked issues trong page.

Backlinks

Trong issue, hiển thị page nào đang tham chiếu issue đó.

Query từ issue_page_links; Issue Detail có tab/section Linked Documents.

Auto-detect issue key

Khi nhập issue key hợp lệ trong page, hệ thống tự nhận diện và tạo link.

Sau khi save/publish page, backend parse nội dung tìm pattern như PROJ-123; nếu issue tồn tại thì tạo link.

Không tạo link lỗi

Nếu issue key không tồn tại, giữ nguyên text và không tạo link sai.

Parser kiểm tra issue key trong database; chỉ tạo link khi issue tồn tại và user có quyền.

Permission hai chiều

User chỉ thấy link khi có quyền xem cả issue và page.

Khi trả linked documents/linked issues, backend filter theo permission của user.

Macro issue list

Nhúng danh sách issue vào page theo filter.

Phase P1; tạo macro block trong editor, lưu filter query, render danh sách issue khi xem page.

Create issue từ page

Highlight text trong page để tạo issue.

Frontend cho phép bôi đen text → Create Issue; mở modal với summary/description điền sẵn.



5.9 Collaboration (Comments, Mentions, Activity)

FR ID

Mô tả

Priority

FR-COL-001

Comment tại issue và page.

P0

FR-COL-002

Mention @user, @team trong comment/description.

P0

FR-COL-003

Activity timeline: ai làm gì, khi nào.

P0

FR-COL-004

Reaction/emojis, pin comment quan trọng.

P1

FR-COL-005

Live update realtime qua WebSocket.

P1

 

Acceptance Criteria — Collaboration

•        Mention @user gửi in-app notification ngay lập tức (< 2 giây).

•        Activity timeline hiển thị đầy đủ: tạo, sửa, chuyển trạng thái, comment, attach file.

 

Nhóm chức năng

Làm gì

Làm thế nào

Comment issue/page

Cho phép user comment trong issue và page.

Tạo bảng comments dạng polymorphic với target_type, target_id; UI có comment box.

Mention user/team

Cho phép mention @user, @team trong comment/description.

Parse mention khi lưu nội dung; kiểm tra quyền người được mention; tạo notification.

Activity timeline

Hiển thị lịch sử ai làm gì, khi nào.

Tạo bảng activity_logs; ghi log khi tạo/sửa issue, chuyển trạng thái, comment, attach file.

Reaction / emoji

Cho phép react vào comment.

Tạo bảng comment_reactions; UI hiển thị emoji và số lượng reaction.

Pin comment

Cho phép ghim comment quan trọng.

Thêm field is_pinned hoặc bảng pinned_comments; chỉ user có quyền mới được pin/unpin.

Live update realtime

Cập nhật comment/activity realtime.

dùng WebSocket hoặc Server-Sent Events.



5.10 Notification

FR ID

Mô tả

Priority

FR-NOTI-001

In-app notifications: badge số lượng chưa đọc.

P0

FR-NOTI-002

Email notification: assignment, mention, status changed.

P0

FR-NOTI-003

Notification preference per user: bật/tắt từng loại event.

P1

FR-NOTI-004

Digest email hàng ngày/tuần tóm tắt hoạt động.

P1

 

Acceptance Criteria — Notification

•        Email notification gửi trong vòng 2 phút sau event.

•        User có thể unsubscribe từng loại notification từ trang cài đặt.

•        Không gửi notification cho chính hành động của user đó (self-action excluded).

 



Nhóm chức năng

Làm gì

Làm thế nào

In-app notification

Hiển thị thông báo trong app và badge số lượng chưa đọc.

Tạo bảng notifications; API list/read/mark all as read; frontend làm Notification Center.

Email notification

Gửi email khi có assignment, mention, status changed.

Tạo notification event; đưa email vào queue; worker gửi email bất đồng bộ.

Notification preference

User có thể bật/tắt từng loại notification.

Tạo bảng notification_preferences; Settings page cho phép cấu hình theo event type.

Digest email

Gửi email tổng hợp theo ngày/tuần.

Tạo scheduled job tổng hợp activity theo user rồi gửi digest email.

Không gửi self-action

Không gửi notification cho chính user thực hiện hành động.

Notification service kiểm tra actor_id != recipient_id trước khi tạo notification.

SLA gửi email

Email phải gửi trong vòng 2 phút sau event.

Dùng queue + worker; monitor queue delay; retry nếu gửi mail lỗi.



5.11 Search

FR ID

Mô tả

Priority

FR-SRCH-001

Global search full-text trên issues/pages/comments.

P0

FR-SRCH-002

Filter theo space, type, assignee, status, date range.

P0

FR-SRCH-003

Saved filters/saved searches per user.

P1

FR-SRCH-004

Search syntax nâng cao (JQL lite): assignee:me status:open.

P1

 

Acceptance Criteria — Search

•        Search phản hồi < 2 giây với dataset 50,000 issues + 10,000 pages.

•        Kết quả search phân quyền đúng: user chỉ thấy issue/page mình có quyền xem.

•        Full-text search hỗ trợ tiếng Việt có dấu.

 



Nhóm chức năng

Làm gì

Làm thế nào

Global search

Tìm kiếm toàn cục trên issue, page, comment.

MVP dùng database full-text search; sau này có thể dùng Elasticsearch/OpenSearch nếu dữ liệu lớn.

Filter search

Lọc kết quả theo space, type, assignee, status, date range.

API search nhận query params; frontend có filter sidebar; tạo index cho field hay lọc.

Permission trong search

User chỉ thấy nội dung mình có quyền xem.

Backend filter kết quả theo permission trước khi trả về; không chỉ ẩn ở frontend.

Search tiếng Việt

Hỗ trợ tìm kiếm tiếng Việt có dấu.

Chọn analyzer/tokenizer phù hợp; normalize text nếu cần; test với từ khóa có dấu và không dấu.

Saved filters

User lưu lại bộ lọc/từ khóa thường dùng.

Tạo bảng saved_searches; UI cho phép save, rename, delete saved search.

Search syntax nâng cao

Hỗ trợ cú pháp như assignee:me status:open.

Viết parser đơn giản chuyển cú pháp thành query filter; triển khai ở P1.

Performance

Search phản hồi dưới 2 giây với dataset lớn.

Tối ưu index, phân trang kết quả, cache query phổ biến, cân nhắc search engine riêng.



5.12 Dashboard & Reporting

FR ID

Mô tả

Priority

FR-RPT-001

Dashboard cá nhân: My Tasks, Overdue, Recently Viewed.

P0

FR-RPT-002

Dashboard space: task theo status/priority/assignee.

P0

FR-RPT-003

Burndown chart, velocity chart, cumulative flow diagram.

P1

FR-RPT-004

Báo cáo productivity theo sprint/release.

P1

FR-RPT-005

Export báo cáo dạng CSV/PDF.

P1

 

Acceptance Criteria — Dashboard

•        Dashboard cá nhân hiển thị đúng task được assign cho user hiện tại, sắp xếp theo due date.

•        Overdue tasks được highlight rõ ràng (màu đỏ hoặc badge).



Nhóm chức năng

Làm gì

Làm thế nào

Dashboard cá nhân

Hiển thị My Tasks, Overdue, Recently Viewed.

API lấy issue assign cho user hiện tại; sort theo due date; lưu recently viewed vào bảng riêng.

Overdue task

Làm nổi bật task quá hạn.

Backend xác định issue có due_date < today và chưa Done; frontend hiển thị badge/màu đỏ.

Dashboard space

Thống kê task theo status, priority, assignee.

API aggregate theo space; dùng query group by status/priority/assignee.

Burndown chart

Hiển thị tiến độ sprint theo thời gian.

Dùng dữ liệu sprint, story point và ngày issue chuyển Done để tính remaining work.

Velocity chart

Hiển thị năng suất qua các sprint.

Tính tổng story point Done mỗi sprint; render chart ở frontend.

Cumulative flow diagram

Hiển thị luồng issue qua các trạng thái.

Dùng status history để tính số lượng issue theo status theo từng ngày.

Export report

Cho phép export báo cáo CSV/PDF.

API export dữ liệu; CSV có thể làm trước, PDF đưa vào phase sau nếu cần.

 



5.13 File/Attachment Management

FR ID

Mô tả

Priority

FR-FILE-001

Upload file đính kèm vào issue/page.

P0

FR-FILE-002

Preview inline: image, PDF, video phổ biến.

P0

FR-FILE-003

Quyền truy cập file theo quyền của object cha.

P0

FR-FILE-004

Version file, replace file giữ lịch sử.

P1

FR-FILE-005

File size limit: tối đa 25MB/file; quota 5GB/space.

P1

 

Acceptance Criteria — File

•        File upload không được phép nếu vượt giới hạn; hiện thông báo rõ dung lượng còn lại.

•        File bị xóa khi issue/page cha bị hard-delete bởi admin.

 



Nhóm chức năng

Làm gì

Làm thế nào

Upload file

Cho phép upload file vào issue hoặc page.

Tạo bảng attachments; API upload nhận file và parent_type, parent_id; lưu file vào object storage/local storage.

Preview inline

Preview image, PDF, video phổ biến.

Frontend render preview theo MIME type; backend trả signed URL hoặc download URL có kiểm quyền.

Permission file

Quyền xem file phụ thuộc quyền của issue/page cha.

Khi upload/download/preview, backend kiểm tra user có quyền xem object cha không.

File version

Replace file nhưng vẫn giữ lịch sử.

Tạo file_versions hoặc version field trong attachments; mỗi lần replace tạo version mới.

File size limit

Giới hạn 25MB/file và quota 5GB/org.

Validate size khi upload; tính tổng dung lượng theo org/space; nếu vượt quota thì trả lỗi rõ ràng.

Cleanup file

File bị xóa khi issue/page cha bị hard-delete bởi admin.

Khi hard-delete object cha, tạo background job xóa file vật lý và attachment metadata.



5.14 Admin & Audit

FR ID

Mô tả

Priority

FR-ADM-001

Quản lý user/role: tạo, sửa, deactivate, đổi role.

P0

FR-ADM-002

Audit log: login, permission change, delete actions, export data.

P0

FR-ADM-003

Quản lý workflow/issue type/status chuẩn toàn hệ thống.

P0

FR-ADM-004

Data retention policy: tự động xóa audit log sau N ngày (cấu hình được).

P1

FR-ADM-005

Backup/restore dữ liệu (admin operations).

P1

 

Acceptance Criteria — Admin & Audit

•        Audit log bất biến (immutable): không ai được sửa hoặc xóa entry; chỉ đọc và export.

•        Audit log lưu tối thiểu 12 tháng; cấu hình được theo chính sách công ty.

•        Super Admin nhận cảnh báo khi có thao tác nhạy cảm: xóa space, thay đổi quyền hàng loạt.

  



Nhóm chức năng

Làm gì

Làm thế nào

Quản lý user/role

Admin tạo, sửa, deactivate user và đổi role.

Tạo Admin Console; API quản lý user/role; backend kiểm tra quyền Super Admin/Org Admin.

Audit log

Ghi log các hành động nhạy cảm như login, đổi quyền, xóa, export.

Tạo bảng audit_logs; mỗi event lưu actor, action, target, old/new value, timestamp, traceId.

Audit immutable

Không ai được sửa hoặc xóa audit log.

Chỉ cho insert; không cung cấp API update/delete; giới hạn quyền database nếu cần.

Workflow/status global

Admin quản lý issue type, workflow, status chuẩn toàn hệ thống.

Tạo màn cấu hình global settings; các project/space có thể dùng hoặc override theo quyền.

Retention policy

Cấu hình thời gian lưu audit log.

Tạo bảng retention_policies; scheduled job archive/xóa theo cấu hình, nhưng tối thiểu 12 tháng.

Backup/restore

Cho phép admin thực hiện thao tác backup/restore dữ liệu.

Phase P1; tích hợp job backup database/file; có runbook restore rõ ràng.

Alert thao tác nhạy cảm

Super Admin nhận cảnh báo khi có hành động nguy hiểm.

Khi xóa space hoặc đổi quyền hàng loạt, tạo alert/in-app/email notification cho Super Admin.



5.15 Integration & API

FR ID

Mô tả

Priority

FR-INT-001

REST API public cho issue/space/page với authentication bằng API key.

P0

FR-INT-002

Webhook events: issue created/updated, page updated, status changed.

P0

FR-INT-003

Slack/Microsoft Teams notification integration.

P1

FR-INT-004

Git integration: commit message chứa issue key tự động link vào issue.

P1

FR-INT-005

Calendar sync: due date/reminder đồng bộ với Google Calendar/Outlook.

P2

 



Nhóm chức năng

Làm gì

Làm thế nào

First-login wizard

Hướng dẫn user khi đăng nhập lần đầu.

Thêm field onboarding_completed; nếu false thì điều hướng user vào onboarding wizard.

Tạo space trong wizard

Hướng dẫn user tạo space đầu tiên.

Wizard có bước nhập tên space, chọn template, tạo space.

Mời thành viên

Hướng dẫn user mời member vào space.

Wizard có bước nhập email, chọn role và gửi invite.

Sample space/template

Tạo dữ liệu mẫu để user hiểu cấu trúc hệ thống.

Seed sample issue, board, page, workflow khi user chọn sample template.

Tooltip/hint

Hiển thị gợi ý tại các tính năng chính.

Dùng contextual tooltip tại Board, Issue Detail, Page Editor, Search.

Video hướng dẫn

Nhúng video hướng dẫn ngắn cho flow quan trọng.

Đưa vào phase P2; lưu link video trong config hoặc CMS nội bộ.



6. Non-Functional Requirements (NFR)

6.1 Hiệu năng

NFR ID

Chỉ số

Mục tiêu

Ghi chú

NFR-PERF-001

API read latency p95

< 500ms

Tải bình thường

NFR-PERF-002

API write latency p95

< 800ms

Tải bình thường

NFR-PERF-003

Search response time

< 2 giây

Dataset: 50K issues + 10K pages

NFR-PERF-004

Page load time (FCP)

< 3 giây

Kết nối 10Mbps

NFR-PERF-005

Concurrent users

100 users đồng thời

Quy mô công ty 50-200 người

NFR-PERF-006

File upload throughput

Tối đa 25MB/file

Timeout 60 giây

 

6.2 Bảo mật

NFR ID

Yêu cầu

NFR-SEC-001

Mã hóa toàn bộ data in-transit qua HTTPS/TLS 1.2+.

NFR-SEC-002

Password hash bằng bcrypt (cost factor >= 12) hoặc argon2id; không lưu plain text.

NFR-SEC-003

RBAC enforced tại backend; không tin tưởng input từ client về role/permission.

NFR-SEC-004

Chống OWASP Top 10: XSS, CSRF token, NoSQL injection, broken access control.

NFR-SEC-005

Audit trail đầy đủ cho mọi thao tác nhạy cảm (delete, permission change, export).

NFR-SEC-006

Rate limiting: tối đa 100 request/phút/IP cho public API; 20 login attempts/giờ.

NFR-SEC-007

Secrets (API key, DB credential) không được commit vào source code; dùng env/vault.

 

6.3 Ổn định & Sẵn sàng

NFR ID

Chỉ số

Mục tiêu

NFR-REL-001

Uptime

99.9% (downtime <= 8.7 giờ/năm)

NFR-REL-002

RPO (Recovery Point Objective)

<= 15 phút

NFR-REL-003

RTO (Recovery Time Objective)

<= 2 giờ

NFR-REL-004

Backup định kỳ

Mỗi 6 giờ, lưu 30 ngày gần nhất

NFR-REL-005

Graceful degradation

Search/notification lỗi không làm sập core (issue/board)

 

6.4 Khả năng mở rộng

•        NFR-SCL-001: Kiến trúc hỗ trợ horizontal scaling cho web server và worker service.

•        NFR-SCL-002: Thiết kế module rõ ràng, tách biệt domain để thêm tính năng mới không ảnh hưởng module cũ.

 

6.5 Quan sát hệ thống (Observability)

•        NFR-OBS-001: Centralized logging với traceId đi xuyên suốt request (correlation ID).

•        NFR-OBS-002: Metrics: response time p50/p95/p99, error rate, queue lag, DB query latency.

•        NFR-OBS-003: Alerting tự động khi: error rate > 1%, latency p95 > 1 giây, disk > 80%.

•        NFR-OBS-004: Audit log retention tối thiểu 12 tháng.

 

7. Data Requirements (Core Entities)

7.1 Danh sách Entity chính

Entity

Mô tả ngắn

Quan hệ chính

User

Tài khoản người dùng

belongs to many Spaces; has many Roles

Space

Đơn vị tổ chức lớn nhất (Kanban hoặc Scrum)

has many Issues, Sprints, Boards, Pages, Users

Team / Membership / Role

Nhóm và phân quyền

belongs to Space; has many Users

IssueType / Priority / Status / Workflow

Cấu hình workflow

belongs to Space hoặc Global

Issue / Sub-task / IssueLink

Task cốt lõi

belongs to Space; self-referential parent-child

Sprint / Board / Backlog

Quản lý scrum

belongs to Space; has many Issues

Comment / ActivityLog / Worklog

Tương tác & lịch sử

polymorphic: belongs to Issue hoặc Page

Page / PageVersion / PageComment

Knowledge base

belongs to Space; Page has versions

Attachment

File đính kèm

polymorphic: belongs to Issue hoặc Page

Notification

Thông báo

belongs to User; polymorphic source

AuditLog

Nhật ký hệ thống

global, immutable

Integration / Webhook

Tích hợp ngoài

belongs to Space

 

7.2 Quy tắc dữ liệu quan trọng

•        Soft delete cho issue/page (trừ hard delete đặc biệt bởi Super Admin).

•        Mọi thay đổi quan trọng phải tạo ActivityLog/AuditLog tương ứng.

•        Chuẩn timezone: lưu UTC toàn bộ trong database; hiển thị theo timezone của user.

•        Dữ liệu nhạy cảm (password, token) không được log dưới bất kỳ hình thức nào.

•        ID sử dụng UUID v4 (trừ issue number dạng SPACEKEY-123 là sequence per space).

 

8. Permission Matrix

Hành động

Super Admin

Space Admin

Member

Viewer

Tạo/xóa Space

✓

✓

✗

✗

Cấu hình workflow/board

✓

✓

✗

✗

Mời member vào Space

✓

✓

✗

✗

Tạo/sửa issue

✓

✓

✓

✗

Xóa issue

✓

✓

✗

✗

Xem issue

✓

✓

✓

✓

Tạo/sửa page

✓

✓

✓

✗

Comment

✓

✓

✓

✗

Xem audit log

✓

✗

✗

✗

Deactivate user

✓

✗

✗

✗

Export dữ liệu

✓

✓

✗

✗

Archive Space

✓

✓

✗

✗

 

9. UI/UX Requirements

12.  Giao diện web responsive: desktop ưu tiên, tablet hỗ trợ tốt (>= 768px).

13.  Navigation trái: Spaces + Board/Backlog + Pages + Reports + Admin (nếu có quyền).

14.  Hỗ trợ drag-drop trên board Kanban và backlog ordering.

15.  Keyboard shortcuts cơ bản: C = create issue, / = quick search, S = save.

16.  Quick create modal cho issue/page từ bất kỳ màn hình nào.

17.  Trạng thái loading/error/empty state rõ ràng với message phù hợp.

18.  Accessibility cơ bản: focus management, color contrast >= 4.5:1, ARIA labels.

19.  Ngôn ngữ: Tiếng Việt trước, cấu trúc i18n sẵn sàng cho tiếng Anh sau.

20.  Dark mode: hỗ trợ ở phase sau (cần thiết kế token màu từ đầu).

21.  Toasts/alerts không che khuất nội dung chính; tự ẩn sau 5 giây với option dismiss.

 

10. API & Integration Standards

10.1 Chuẩn chung

•        Base path: /api/v1

•        Authentication: Bearer token (JWT) hoặc API Key qua header X-API-Key.

•        Content-Type: application/json cho tất cả request/response.

•        Phân trang: query param page (default 1) và limit (default 20, max 100).

•        Sorting: sort=field:asc hoặc sort=field:desc.

 

10.2 Chuẩn Response

Success Response

{ "data": { "id": "AL-123", "summary": "Fix login bug", "status": "In Progress" }, "meta": { "page": 1, "limit": 20, "total": 150 } }

 

Error Response

{ "code": "ISSUE_NOT_FOUND", "message": "Issue AL-999 không tồn tại.", "details": { "issueId": "AL-999" }, "traceId": "abc123-xyz" }

 

10.3 HTTP Status Codes

Status Code

Ý nghĩa

200 OK

Thành công (GET, PUT, PATCH)

201 Created

Tạo mới thành công (POST)

204 No Content

Xóa thành công

400 Bad Request

Validation lỗi; trả về details field nào sai

401 Unauthorized

Token hết hạn hoặc không hợp lệ

403 Forbidden

Không đủ quyền

404 Not Found

Resource không tồn tại

409 Conflict

Trùng lặp dữ liệu

429 Too Many Requests

Rate limit vượt mức

500 Internal Server Error

Lỗi server; luôn kèm traceId để debug

 

11. Testing & Quality Requirements

11.1 Cấp độ test

Loại test

Phạm vi

Tool gợi ý

Coverage mục tiêu

Unit test

Service / Business logic

Jest / Vitest

>= 70%

Integration test

API endpoints chính

Supertest / Postman

Tất cả P0 endpoint

E2E test

Flow trọng yếu

Playwright / Cypress

Tối thiểu 5 flow P0

UAT

Role-based scenarios

Manual testing

Theo checklist role matrix

Performance test

Load testing trước go-live

k6 / Artillery

100 concurrent users

Security test

OWASP Top 10

Manual + OWASP ZAP

Trước mỗi major release

 

11.2 E2E Flow trọng yếu

22.  Login → tạo Space (Kanban) → tạo issue → assign → kéo card trên Board → close issue.

23.  Login → tạo Space (Scrum) → tạo issue vào Backlog → tạo Sprint → start Sprint → close Sprint.

24.  Tạo page → versioning → restore version cũ → permission check.

25.  Invite user → user nhận email → join Space → được assign issue.

26.  Admin deactivate user → session bị revoke → user không thể truy cập.

 

12. Definition of Done (DoD)

Một tính năng được xem là hoàn tất khi đáp ứng đủ các tiêu chí sau:

 

#

Tiêu chí

Ghi chú

1

Đạt tất cả Acceptance Criteria đã định nghĩa.

Verified bởi QA

2

Có test coverage phù hợp (unit/integration/e2e theo mức độ).

Không merge nếu test fail

3

Được code review và approved bởi ít nhất 1 người.

No unresolved comment

4

Được QA pass trên staging environment.

Không có critical bug

5

Có audit/activity log nếu là thao tác nhạy cảm.

Bắt buộc với P0 security feature

6

Có tài liệu hướng dẫn sử dụng/cấu hình liên quan.

Cập nhật wiki/page nội bộ

7

Không có regression trên flow P0 đã pass trước đó.

Regression checklist

 

13. Release Plan

Phase

Nội dung chính

Mục tiêu

Phase 1 — MVP (P0)

Auth + RBAC, Space Management (Kanban & Scrum), Board + Backlog + Sprint cơ bản, Issue CRUD + Workflow, Pages + versioning, Comment + notification cơ bản, Search cơ bản, Onboarding wizard

Go-live nội bộ

Phase 2 (P1)

Scrum sprint đầy đủ, Reporting nâng cao, Custom fields/workflow, Template docs, Slack/Git integration, MFA, Notification preference

3 tháng sau Phase 1

Phase 3 (P2)

AI features, Portfolio view, Advanced automations, Mobile PWA, Calendar sync

Theo roadmap

 

14. Rủi ro chính & Hướng xử lý

Rủi ro

Xác suất

Mức độ ảnh hưởng

Hướng xử lý

Phân quyền phức tạp dễ bug

Cao

Cao

Thiết kế permission matrix sớm; test role matrix đầy đủ; không hardcode role ở frontend.

Hiệu năng search kém khi data lớn

Trung bình

Cao

Tách search index (Elasticsearch/OpenSearch) nếu MongoDB text search không đủ; monitor query time từ đầu.

Dữ liệu audit log phình to nhanh

Cao

Trung bình

Retention policy + archive strategy; log chỉ event quan trọng, không log read operations.

Tỷ lệ adoption thấp

Trung bình

Cao

Onboarding wizard + sample space; tập huấn đội ngũ trước go-live; thu thập feedback tuần đầu.

Mất dữ liệu do người dùng xóa nhầm

Thấp

Cao

Soft delete + 30 ngày restore window; confirm dialog cho delete action.

Nghỉ việc đột xuất không thu hồi quyền kịp

Trung bình

Cao

FR-AUTH-009: deactivate user revoke session ngay; quy trình offboarding IT có checklist.

 

15. Deliverables

#

Deliverable

Trạng thái

1

BRD/PRD hoàn chỉnh (tài liệu này)

In Progress

2

SRS/API contract (OpenAPI spec)

Planned

3

Wireframe/UI flow (Figma)

Planned

4

Data model / ERD

Planned

5

Backlog user stories + estimate

Planned

6

Test plan + test cases

Planned

7

Deployment runbook + monitoring dashboard

Planned

 

16. Glossary

Thuật ngữ

Định nghĩa

Space

Đơn vị tổ chức lớn nhất trong hệ thống, đại diện cho một team hoặc dự án. Tương đương ‘Project’ trong Jira.

Space Key

Mã viết tắt duy nhất của Space, dùng làm prefix cho issue (VD: AL-TASK → issue AL-TASK-1).

Board

Giao diện Kanban hiển thị issue dưới dạng card, sắp xếp theo cột trạng thái.

Backlog

Danh sách issue chưa được lên sprint, sắp xếp theo priority.

Epic

Issue cấp cao nhất, đại diện cho một tính năng lớn, bao gồm nhiều Story.

Story / User Story

Mô tả một tính năng từ góc độ người dùng cuối.

Task

Công việc kỹ thuật cụ thể, thường là con của Story.

Sub-task

Công việc nhỏ hơn thuộc Task.

Sprint

Khoảng thời gian cố định (thường 1–2 tuần) để hoàn thành một tập issue.

Story Point

Đơn vị ước lượng độ phức tạp của issue, không phải giờ làm việc.

WIP Limit

(Work In Progress Limit) Giới hạn số issue được phép tồn tại đồng thời trong một cột Kanban.

RBAC

(Role-Based Access Control) Phân quyền dựa trên vai trò.

Soft Delete

Đánh dấu xóa nhưng không xóa khỏi database; có thể khôi phục.

JWT

(JSON Web Token) Chuẩn token dùng để xác thực API.

p95 latency

Độ trễ mà 95% request hoàn thành trong thời gian đó hoặc nhanh hơn.

RPO

(Recovery Point Objective) Lượng dữ liệu tối đa có thể mất khi xảy ra sự cố.

RTO

(Recovery Time Objective) Thời gian tối đa để khôi phục hệ thống sau sự cố.

 

Tài liệu nội bộ • Task Management Platform • Version 1.1

Orgarnizaton cho app 
