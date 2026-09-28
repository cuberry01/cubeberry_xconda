TRUNCATE contents, send_logs, subscribers RESTART IDENTITY;

INSERT INTO subscribers (email, name, source, token) VALUES
 ('hong@example.com', '홍길동', 'manual', 'tokdemo0001'),
 ('kim@example.com', '김철수', 'sheet', 'tokdemo0002'),
 ('lee@example.com', '이영희', 'manual', 'tokdemo0003');

INSERT INTO contents (key, row_number, subject, body, link, image_url, recipients, raw_schedule, scheduled_at, active, in_sheet, status, sent_at, sent_count, fail_count) VALUES
 ('h:demo1', 2, '{{이름}}님, 10월 첫 소식입니다', '안녕하세요! 10월 업데이트를 전해드립니다.\n\n**새 기능**이 추가되었으니 확인해 보세요.', 'https://example.com/news/october', '', '', '2026-10-05 09:00', '2026-10-04 15:00:00+09', true, true, 'pending', NULL, 0, 0),
 ('h:demo2', 3, '주간 팁 #1 — 메일이 스팸으로 가지 않게', '발신자 도메인에 SPF, DKIM을 설정하면 도달률이 크게 올라갑니다.', 'https://example.com/tips/spf', '', '', '', NULL, true, true, 'pending', NULL, 0, 0),
 ('h:demo3', 4, '뉴스레터 디자인 가이드', '이미지는 가로 600px 이상, 2MB 이하를 권장합니다.', 'https://example.com/guide', 'https://placehold.co/600x240/4f46e5/ffffff?text=Newsletter+Banner', '', '', NULL, true, true, 'sent', '2026-09-28 09:00:00+09', 3, 0),
 ('h:demo4', 5, '구독 감사 이벤트 (보류)', '아직 작성 중인 초안입니다.', '', '', '', '', NULL, false, true, 'pending', NULL, 0, 0);

INSERT INTO send_logs (content_id, subject, email, status, provider) VALUES
 (3, '뉴스레터 디자인 가이드', 'hong@example.com', 'sent', 'test'),
 (3, '뉴스레터 디자인 가이드', 'kim@example.com', 'sent', 'test'),
 (3, '뉴스레터 디자인 가이드', 'lee@example.com', 'sent', 'test');
