// Russian for the English messages of shared code (schemas, API and action
// errors, the worker), keyed by the English text. See translateMessage().
// Messages only API clients see (malformed headers etc.) are left out.

export const ruMessages: Record<string, string> = {
  // Validation (zod schemas, shared by forms and the API)
  "Enter a name.": "Введите имя.",
  "Enter your name.": "Введите имя.",
  "Enter a valid email.": "Введите корректный email.",
  "Enter your password.": "Введите пароль.",
  "Enter the password.": "Введите пароль.",
  "Use at least 8 characters.": "Не меньше 8 символов.",
  "Use at least 6 characters.": "Не меньше 6 символов.",
  "Use at most 100 characters.": "Не больше 100 символов.",
  "Use at most 128 characters.": "Не больше 128 символов.",
  "Keep it under 100 characters.": "Не больше 100 символов.",
  "Keep it under 80 characters.": "Не больше 80 символов.",
  "Keep it under 2000 characters.": "Не больше 2000 символов.",
  "Keep it under 5000 characters.": "Не больше 5000 символов.",
  "Choose a role.": "Выберите роль.",
  "Write something first.": "Сначала напишите текст.",
  "Pick a time in the future.": "Выберите время в будущем.",
  "Pick at least one reviewer.": "Выберите хотя бы одного ревьюера.",
  "Needs at least 1 approval.": "Нужно хотя бы одно одобрение.",
  "Can't need more approvals than there are reviewers.": "Одобрений не может требоваться больше, чем ревьюеров.",
  "A reviewer can only be in one step.": "Ревьюер может быть только в одном шаге.",
  "The range must end after it starts.": "Конец диапазона должен быть позже начала.",
  "Give the folder a name.": "Дайте папке название.",
  "Folder names can't contain “/”.": "Название папки не может содержать «/».",
  "Tell us your name.": "Представьтесь, пожалуйста.",
  "Use at least 6 characters, or leave empty.": "Не меньше 6 символов или оставьте пустым.",
  "Check the highlighted fields.": "Проверьте отмеченные поля.",
  "The file is empty.": "Файл пустой.",
  "Files can be at most 5 GB.": "Файл может быть не больше 5 ГБ.",
  "Only MP4, MOV, WebM, JPEG, PNG and WebP files are supported.":
    "Поддерживаются только MP4, MOV, WebM, JPEG, PNG и WebP.",

  // Auth and workspaces
  "Wrong email or password.": "Неверный email или пароль.",
  "This email is already registered.": "Этот email уже зарегистрирован.",
  "An account with this email already exists.": "Аккаунт с таким email уже есть.",
  "This link is invalid or has expired. Request a new one.": "Ссылка недействительна или устарела. Запросите новую.",
  "We couldn't send the email right now. Try again in a minute.": "Сейчас не получилось отправить письмо. Попробуйте через минуту.",
  "Only owners can invite people.": "Приглашать могут только владельцы.",
  "Already a member.": "Уже участник.",
  "This person is already a member of the workspace.": "Этот человек уже участник workspace.",
  "Invitation saved, but the email couldn't be sent. Invite again in a minute.":
    "Приглашение сохранено, но письмо не ушло. Пригласите ещё раз через минуту.",
  "A workspace needs at least one owner.": "У workspace должен остаться хотя бы один владелец.",
  "You don't have access to create projects here.": "У вас нет прав создавать здесь проекты.",
  "You don't have access to do that.": "У вас нет прав на это действие.",

  // Uploads and processing
  "You can't upload to this project.": "Вы не можете загружать файлы в этот проект.",
  "Project not found.": "Проект не найден.",
  "Asset not found.": "Ассет не найден.",
  "Upload not found.": "Загрузка не найдена.",
  "Folder not found.": "Папка не найдена.",
  "A new version of a video must also be a video.": "Новая версия видео тоже должна быть видео.",
  "A new version of a image must also be a image.": "Новая версия изображения тоже должна быть изображением.",
  "File storage is unavailable. Try again in a minute.": "Хранилище файлов недоступно. Попробуйте через минуту.",
  "This upload is no longer active.": "Эта загрузка уже неактивна.",
  "Not all parts were uploaded.": "Загружены не все части.",
  "Some parts are missing or damaged. Retry the upload.": "Часть данных потерялась или повреждена. Повторите загрузку.",
  "The stored file size doesn't match. Upload the file again.": "Размер сохранённого файла не совпадает. Загрузите файл ещё раз.",
  "Upload interrupted. Check your connection and retry.": "Загрузка прервалась. Проверьте соединение и повторите.",
  "Not a video or image we can read.": "Это не видео и не изображение, которое мы можем прочитать.",
  "Expected a video, got an image.": "Ожидалось видео, а это изображение.",
  "Expected an image, got a video.": "Ожидалось изображение, а это видео.",
  "The stored file doesn't match what was uploaded (checksum mismatch). Upload it again.":
    "Сохранённый файл не совпадает с загруженным (контрольная сумма). Загрузите его ещё раз.",
  "Processing took too long and was stopped.": "Обработка шла слишком долго и была остановлена.",
  "A temporary error interrupted processing.": "Обработку прервала временная ошибка.",
  "This version isn't ready to play.": "Эта версия ещё не готова к просмотру.",
  "Couldn't transcribe the audio.": "Не удалось распознать речь.",

  // Folders
  "A folder with this name already exists here.": "Папка с таким названием здесь уже есть.",
  "Name taken.": "Название занято.",
  "That folder no longer exists.": "Этой папки больше нет.",
  "You can't add folders here.": "Вы не можете создавать здесь папки.",
  "You can't move this asset.": "Вы не можете переместить этот ассет.",

  // Comments
  "Viewers can't comment.": "Наблюдатели не могут комментировать.",
  "Viewers can't change comments.": "Наблюдатели не могут менять комментарии.",
  "Thread not found.": "Тред не найден.",
  "Comment not found.": "Комментарий не найден.",
  "Version not found.": "Версия не найдена.",
  "Reply to the first comment of the thread.": "Отвечайте на первый комментарий треда.",
  "The timecode is past the end of the video.": "Таймкод за пределами видео.",
  "The range ends past the end of the video.": "Диапазон заканчивается за пределами видео.",
  "Past the end of the video.": "За пределами видео.",
  "You can only edit your own comments.": "Можно редактировать только свои комментарии.",
  "You can only delete your own comments.": "Можно удалять только свои комментарии.",
  "Only threads can be resolved.": "Решёнными можно отмечать только треды.",
  "Someone else changed this comment. Showing the latest version.": "Кто-то уже изменил этот комментарий. Показываем последнюю версию.",

  // Reviews
  "You can't request reviews here.": "Вы не можете запрашивать здесь ревью.",
  "Pick a version of this asset.": "Выберите версию этого ассета.",
  "Unknown version.": "Неизвестная версия.",
  "Some reviewers can't review in this workspace.": "Некоторые ревьюеры не могут проводить ревью в этом workspace.",
  "Only reviewers, editors and owners of this workspace can review.":
    "Ревью могут проводить только ревьюеры, редакторы и владельцы workspace.",
  "This asset already has an active review.": "У этого ассета уже идёт ревью.",
  "Review not found.": "Ревью не найдено.",
  "Viewers can't decide on reviews.": "Наблюдатели не могут принимать решения по ревью.",
  "This review step was already settled.": "Этот шаг ревью уже завершён.",
  "You're not a reviewer of the current step.": "Вы не ревьюер текущего шага.",
  "You already decided on this step.": "Вы уже приняли решение на этом шаге.",

  // Share links
  "You can't share this asset.": "Вы не можете делиться этим ассетом.",
  "You can't manage links here.": "Вы не можете управлять ссылками здесь.",
  "Link not found.": "Ссылка не найдена.",
  "This link is not available.": "Ссылка недоступна.",
  "Wrong password.": "Неверный пароль.",
  "Too many wrong passwords. Try again in 15 minutes.": "Слишком много неверных паролей. Попробуйте через 15 минут.",
  "Comments are off for this link.": "Для этой ссылки комментарии выключены.",
  "Downloads are off for this link.": "Для этой ссылки скачивание выключено.",

  // Generic
  "Sign in required.": "Нужно войти.",
  "Something went wrong.": "Что-то пошло не так.",
  "You're offline. Try again.": "Нет соединения. Попробуйте ещё раз.",
  "Not found.": "Не найдено.",
};
