# Media Review Hub

Сервис ревью видео и изображений, упрощённый Frame.io. Пользователи загружают ролики, worker обрабатывает их в фоне (HLS, спрайт, постер), ревьюеры оставляют комментарии с таймкодом и диапазоном и рисуют поверх кадра, владелец собирает апрувы в несколько шагов, гости смотрят и комментируют по публичной ссылке.

Сделаны уровни **Core** и **Advanced** целиком и все пункты **Bonus**. Ограничения перечислены в конце.

Устройство системы и принятые решения: [ARCHITECTURE.md](ARCHITECTURE.md).

## Запуск

Нужен только Docker (Node на машине не нужен).

```bash
cp .env.example .env
docker compose up --build
```

Сборка с нуля занимает около 3 минут, затем стек становится healthy примерно за 30 секунд.

| Что | Адрес |
|---|---|
| Приложение (через Caddy) | http://localhost:3000 |
| Письма (Mailpit) | http://localhost:8025 |
| S3 (MinIO, presigned URL для браузера) | http://localhost:9000 |
| Трейсы (Jaeger, профиль `observability`) | http://localhost:16686 |

Демо-данные создаёт контейнер `migrate`: workspace «Demo Studio», проект «Spring Campaign» и три пользователя с паролем `password123`.

| Пользователь | Роль |
|---|---|
| `owner@example.com` | owner |
| `editor@example.com` | editor (загружает, создаёт ревью и публичные ссылки) |
| `reviewer@example.com` | reviewer (комментирует, принимает решения) |

### Профили compose

| Команда | Что добавляет |
|---|---|
| `docker compose up --scale web=2 --scale worker=3` | несколько экземпляров web за Caddy и несколько worker |
| `docker compose --profile e2e up --build --abort-on-container-exit --exit-code-from e2e` | Playwright в контейнере `mcr.microsoft.com/playwright`, код выхода = результат тестов |
| `docker compose --profile integration run --rm --build integration` | интеграционные тесты (Vitest) против Postgres, Redis и MinIO стека |
| `docker compose --profile observability up` + `OTEL_EXPORTER_OTLP_ENDPOINT` в `.env` | Jaeger и трейсы web → очередь → worker |
| `docker compose --profile transcription up` + `WHISPER_URL` в `.env` | контейнер whisper.cpp: субтитры и поиск по речи |

### Режим разработки

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Исходники подключаются bind mount'ом: web работает через `next dev`, worker через `tsx watch`. Postgres открыт на `localhost:5433`, Redis на `localhost:6379`. Production-конфигурация от dev-файла не зависит.

Локально без Docker: `nvm use` (Node 22), `npm ci`, затем `npm test`, `npm run typecheck`, `npm run lint`. E2E с хоста против поднятого стека: `npx playwright test`.

## Переменные окружения

Все переменные проверяются zod при старте ([src/server/env-schema.ts](src/server/env-schema.ts)). Если чего-то не хватает, процесс сразу завершается со списком недостающих переменных.

| Переменная | Кто читает | Назначение |
|---|---|---|
| `APP_URL` | web, worker | Публичный адрес: ссылки в письмах, CORS MinIO, проверка Origin |
| `DATABASE_URL` | web, worker, migrate | Postgres |
| `REDIS_URL` | web, worker | Очереди BullMQ, pub/sub для realtime, лимиты попыток пароля |
| `S3_ENDPOINT` | web, worker | MinIO внутри сети compose (`http://minio:9000`) |
| `S3_PUBLIC_ENDPOINT` | web | MinIO для браузера (`http://localhost:9000`): хост входит в подпись presigned URL |
| `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | web, worker, minio | Доступ к бакету |
| `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` | worker | Отправка писем в Mailpit |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | postgres | Инициализация БД |
| `LOG_LEVEL` | все | Уровень JSON-логов (по умолчанию `info`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | web, worker | Необязательная. Куда слать трейсы (`http://jaeger:4318`). Без неё трейсинг выключен |
| `WHISPER_URL` | worker | Необязательная. Сервис распознавания речи (`http://whisper:8080`). Без неё транскрипции нет |

## Образы

Один multi-stage [Dockerfile](Dockerfile) с таргетами `web`, `worker`, `migrate`, `dev`, `test`, `e2e` и `whisper`. Размеры по `docker image ls` (arm64):

| Образ | Размер | Содержимое |
|---|---|---|
| `media-review-hub-web` | **194 MB** | `node:22-alpine` + `.next/standalone` (лимит ТЗ 250 MB, проверяется в CI) |
| `media-review-hub-worker` | 276 MB | `node:22-alpine` + ffmpeg + один JS-файл (esbuild-бандл, без `node_modules`) |
| `media-review-hub-migrate` | 165 MB | `node:22-alpine` + бандл миграций и seed + SQL-файлы |
| `media-review-hub-whisper` | 249 MB | whisper.cpp v1.9.4, собранный из исходников, + модель `base` (142 MB) |

- Процессы работают не от root: `node` в образах приложения, `pwuser` в e2e, отдельный пользователь в whisper.
- В runtime-образах нет dev-зависимостей и кеша npm. Слой зависимостей пересобирается только при изменении `package*.json` (`--mount=type=cache`).
- Healthcheck есть у каждого сервиса. `web` проверяет Postgres, Redis и S3 через `/api/health`, `caddy` проверяет, что за ним есть живой web, `worker` пишет файл-heartbeat, пока отвечает Redis.

## Как проверить вручную пункты раздела 9 ТЗ

| Пункт | Как проверить |
|---|---|
| `up --build` на чистой машине; `down` и `up` без `--build` | Данные (пользователи, файлы в MinIO) на месте. `migrate` повторно не падает: применённые миграции записаны в `drizzle.__drizzle_migrations`, seed идемпотентен |
| `.env` без `S3_SECRET_KEY` | Удалить строку из `.env`, выполнить `docker compose up web`. В логе `Invalid environment variables: - S3_SECRET_KEY: missing`, код выхода 1 |
| Остановить `redis` | `docker compose stop redis`: `/api/health` отдаёт 503 с `"redis": {"ok": false}`, на страницах проекта и ассета баннер «Live updates are paused». `docker compose start redis` — всё восстанавливается без перезапуска web |
| `stop worker` посреди транскодинга, затем `start` | Загрузить длинное видео и на 10–50% выполнить `docker compose stop worker`: worker дождётся текущей задачи (до 2 минут). При `kill` задача после `start` переобработается: файлы лежат по фиксированным ключам, версия одна |
| 3 ГБ: закрыть вкладку на 40% и продолжить | Закрыть вкладку посреди загрузки. На странице проекта появится блок «Unfinished uploads» с процентом. Выбрать тот же файл: строка покажет «resumed at N%», докачаются только недостающие части. Worker сверяет SHA-256 всего файла |
| Отключить сеть на 20 секунд | Часть повторяется с backoff 1+2+4+8+16 с, обрыв до ~30 с переживается автоматически. Если дольше, файл получает «Failed», и Retry продолжает с незагруженных частей |
| `.exe` под видом `.mp4`; обрезанный mp4 | Версия получает «Processing failed: Not a video or image we can read.» после одной попытки, без повторов. Кнопка Retry доступна |
| 29.97 fps: последний кадр минуты | Unit-тесты [timecode.test.ts](src/features/player/timecode.test.ts): кадр 1799 даёт `00:00:59;29`, 1800 — `00:01:00;02`. В браузере через `requestVideoFrameCallback` проверено, что HLS показывает ровно запрошенный кадр (сегменты без B-кадров, см. ARCHITECTURE) |
| Стрелка в маленьком окне → fullscreen | Нарисовать стрелку («Draw on frame»), открыть комментарий и нажать `F`: кончик стрелки в той же точке кадра, в том числе при letterbox |
| Два ревьюера шага `any` одновременно | Записывается ровно одно решение (блокировка строки запроса), второй получает 409 и видит «Settled by … before you decided». Покрыто интеграционным тестом |
| Новая версия во время ревью | Ревью получает «Outdated», ассет возвращается в «In review», кнопка «Restart review on vN» открывает мастер с теми же шагами |
| Удалённый ревьюер открывает старую ссылку и дёргает presigned URL | Страница ассета даёт 404, `.../playback` и каждый HLS-сегмент тоже 404: членство проверяется в БД на каждом запросе. Покрыто интеграционными тестами |
| Публичная ссылка: 20 неверных паролей; отзыв во время просмотра | После 10 неверных паролей с одного IP (или 50 на ссылку из любых IP) — «Too many wrong passwords» на 15 минут, даже для верного пароля. После отзыва следующий сегмент получает 404, страница гостя раз в 10 секунд проверяет ссылку и показывает «This link was turned off». Покрыто e2e-тестом 4 |
| `--scale worker=3` и 10 видео | Каждая версия обработана ровно один раз: `jobId = versionId`, блокировки BullMQ |
| `--scale web=2` | Все 4 e2e-теста проходят с двумя экземплярами за Caddy: сессии в Postgres, realtime через Redis pub/sub, любой экземпляр обслуживает любой запрос |

## Тесты

```bash
npm test                                                    # 198 unit + 6 component (Vitest, RTL)
docker compose --profile integration run --rm integration   # 11 integration
docker compose --profile e2e up --build --abort-on-container-exit --exit-code-from e2e   # 4 e2e
```

- **Unit:** правила согласования (`all`/`any`/`atLeast`, параллельные решения); таймкод (23.976, 25, 29.97, 59.94); нарезка на части и состояние возобновления загрузки; разбор ffprobe и прогресса ffmpeg; аргументы HLS и спрайта; геометрия аннотаций; токен и срок публичной ссылки; CSP; CSV; разбор Whisper и WebVTT; поисковый запрос; выбор локали и русские формы множественного числа.
- **Component (RTL):** мастер review request со сменой правила и двумя шагами; форма комментария с таймкодом, диапазоном и стрелкой.
- **Integration:** multipart-загрузка в MinIO с complete и повтором complete, права на presigned URL (роли, чужой проект, удаление участника посреди загрузки), переходы шагов ревью и гонка решений в транзакции, idempotency key, одно активное ревью на ассет.
- **E2E:** регистрация → загрузка → обработка по SSE → воспроизведение; комментарий со стрелкой в реальном времени и ответ; двухшаговый апрув `any` → `all`; публичная ссылка с паролем, гостевой комментарий, отзыв.

**CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)): lint, typecheck, unit и component; сборка образов через `docker/bake-action` с кешем слоёв в GitHub Actions; проверка размера web; интеграционные тесты; e2e-профиль. Workflow проверен `actionlint`, но в GitHub не запускался.

## Bonus

- **Транскрипция:** worker вырезает звук из 720p, whisper.cpp (модель `base`, русский и английский, язык определяется сам) возвращает реплики. Результат — дорожка субтитров в плеере (кнопка CC) и панель «Transcript» с поиском по началу слов (Postgres full-text, GIN-индекс).
- **Экспорт комментариев в CSV:** «Export CSV» в панели комментариев. Таймкоды в формате плеера, гости помечены, ячейки, похожие на формулы, обезврежены.
- **OpenTelemetry:** один трейс от `POST /api/uploads/:id/complete` в web через очередь BullMQ (`traceparent` в данных задачи) до этапов обработки в worker (download and verify, ffprobe, render video, store renditions, transcribe).
- **i18n ru/en:** переключатель EN/RU в шапке, выбор сохраняется в cookie, по умолчанию берётся язык браузера.

## Известные ограничения

- После паузы прогресс загрузки откатывается к последней завершённой части (до 4 × 16 МБ): S3 не сохраняет недогруженную часть.
- Возобновление узнаёт файл по имени, размеру и хешу первых 4 МБ. Хеш всего файла после продолжения считается заново (в Web Worker).
- Без B-кадров рендишены HLS на ~6% больше, это цена точного таймкода. Для исходников 360p и ниже обе версии HLS одинаковые, и выбор качества скрыт.
- Гость не видит чужие комментарии в реальном времени (только после перезагрузки) и не может отвечать в треды.
- Правка комментария меняет только текст, рисунок не меняется.
- J/K/L: браузер не проигрывает видео назад, поэтому J — это назад на 1 секунду.
- Поиск по транскрипту ищет по началу слова без стемминга: «логот» находит «логотип», а «логотипа» — нет.
- Письма отправляются только на английском (язык получателя неизвестен).
- Проверено в Chromium. Сенсорный ввод для рисования не проверялся.

**Отклонения от ТЗ:**
- **MinIO больше не публикует официальные образы**, используется сборка Chainguard (`cgr.dev/chainguard/minio`), закреплённая по digest.
- **MinIO не поддерживает bucket CORS и lifecycle `AbortIncompleteMultipartUpload`** (`NotImplemented`/`MalformedXML` на живом сервере). Вместо них серверные настройки `MINIO_API_CORS_ALLOW_ORIGIN` и `MINIO_API_STALE_UPLOADS_EXPIRY` плюс ежечасная задача worker. `minio-init` только создаёт бакет.
- Экспорт комментариев сделан в CSV (ТЗ: «PDF или CSV»).
- Одноразовые `migrate` и `minio-init` помечены `attach: false`: иначе `--abort-on-container-exit` остановил бы стек при их штатном завершении.

## Структура

```
src/app/              маршруты: тонкие страницы и Route Handlers (/s/[token] — публичные ссылки)
src/features/<x>/     фичи: schema.ts (zod, общий для клиента и сервера), server.ts / queries.ts (server-only),
                      actions.ts (Server Actions), components/, чистая логика с тестами рядом
src/server/           инфраструктура: env, db + schema, redis, s3, очереди, письма, логи, SSE-хаб, трейсинг, лимиты
src/i18n/             словари ru/en, выбор локали, перевод сообщений
worker/               фоновые задачи (медиа, транскрипция, письма, очистка, напоминания)
e2e/                  Playwright-тесты и тестовый ролик
scripts/, drizzle/    миграции и seed (контейнер migrate)
docker/               Caddyfile, minio-init
```
