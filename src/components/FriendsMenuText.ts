import type { CoopLanguage, CoopTextKey } from '../game/multiplayer/i18n';

const en = {
  mode: 'Friends mode', back: 'Back', close: 'Back to menu', language: 'Language',
  title: 'A little adventure, together.', intro: 'Explore the island, make something, and see where the day takes you.',
  name: 'Your name', namePlaceholder: 'What should we call you?', nameHelp: 'Use 2–16 letters or numbers. Spaces, _ and - are welcome.',
  continue: 'Continue your island', first: 'Your first island', saved: 'Saved on this device', firstHelp: 'Your progress will be saved on this device.',
  host: 'Open my island', hosting: 'Opening your island…', join: 'Join a friend', solo: 'Play on my own',
  publicNote: 'Open islands appear in the room list. Your world is saved on this device.',
  joinTitle: 'Where are we meeting?', joinIntro: 'Ask a friend for their room code, or find an open island below.',
  roomCode: 'Room code', codePlaceholder: 'Paste a code or invite link', joinAction: 'Join', openIslands: 'Open islands',
  refresh: 'Refresh islands', empty: 'No open islands yet.', emptyHelp: 'Start one of your own, or ask a friend for their room code.',
  discoveryError: "We couldn't load the room list.", discoveryHelp: 'You can still try a room code.', gathering: 'Gathering', exploring: 'Exploring', full: 'Full', watch: 'Watch',
  hostTitle: 'Your island is open.', hostIntro: "Send a friend your invite link, then head out when you're ready.",
  copyCode: 'Copy code', copyLink: 'Copy invite link', copied: 'Copied', linkCopied: 'Link copied',
  roster: "Who's coming?", you: 'You', hostLabel: 'Host', connected: 'Connected', emptySlot: 'Room for {count} more',
  launch: 'Head into the island', closeRoom: 'Close room', leave: 'Leave room', cancel: 'Cancel connection', hostSave: "The island is saved on the host's device.",
  connectingTitle: 'Making a little room for you…', connectingIntro: "Connecting to your friend's island. This can take a moment.",
  guestTitle: "You're invited.", guestIntro: 'Waiting for the host to head into the island.',
  watchTitle: "Let's see what they're making.", watchIntro: 'Joining as a viewer.',
  pause: 'Pause scenery', resume: 'Resume scenery', location: 'Sunline island', locationDetail: 'Room to wander. Time to make something.',
  help: 'Connection help', helpIntro: "If a room code isn't working, you can connect by exchanging connection text.",
  manualHost: 'Create connection text', manualGuest: 'Use connection text', manualHostTitle: 'Invite a friend directly.', manualGuestTitle: 'Meet without a room code.',
  offer: '1. Send this connection text to your friend', answer: "2. Paste your friend's reply", pasteOffer: '1. Paste the connection text from your friend',
  createAnswer: 'Create reply', copyAnswer: 'Copy reply', answerReady: '2. Send this reply back to your friend', acceptAnswer: 'Connect friend', nextInvite: 'Invite another friend',
  busy: 'Please wait…', tryAgain: 'Try again', of: '{current} of {max}', island: "{name}'s island", online: 'Looking for open islands…',
};
type Text = typeof en;
const ru: Text = {
  mode: 'Режим друзей', back: 'Назад', close: 'Вернуться в меню', language: 'Язык',
  title: 'Маленькое приключение вместе.', intro: 'Исследуйте остров, создавайте что-нибудь и наслаждайтесь каждым днём.',
  name: 'Ваше имя', namePlaceholder: 'Как вас зовут?', nameHelp: 'От 2 до 16 букв или цифр. Можно использовать пробелы, _ и -.',
  continue: 'Продолжить на острове', first: 'Ваш первый остров', saved: 'Сохранено на этом устройстве', firstHelp: 'Ваш прогресс будет сохранён на этом устройстве.',
  host: 'Открыть мой остров', hosting: 'Открываем ваш остров…', join: 'Присоединиться к другу', solo: 'Играть одному',
  publicNote: 'Открытые острова видны в списке комнат. Мир сохраняется на этом устройстве.',
  joinTitle: 'Где встречаемся?', joinIntro: 'Попросите у друга код комнаты или выберите открытый остров.',
  roomCode: 'Код комнаты', codePlaceholder: 'Вставьте код или ссылку', joinAction: 'Войти', openIslands: 'Открытые острова',
  refresh: 'Обновить список', empty: 'Пока нет открытых островов.', emptyHelp: 'Откройте свой остров или попросите у друга код комнаты.',
  discoveryError: 'Не удалось загрузить список.', discoveryHelp: 'Вы можете попробовать код комнаты.', gathering: 'Собираемся', exploring: 'Исследуют остров', full: 'Нет мест', watch: 'Смотреть',
  hostTitle: 'Ваш остров открыт.', hostIntro: 'Отправьте другу ссылку и отправляйтесь на остров, когда будете готовы.',
  copyCode: 'Копировать код', copyLink: 'Копировать приглашение', copied: 'Скопировано', linkCopied: 'Ссылка скопирована',
  roster: 'Кто с нами?', you: 'Вы', hostLabel: 'Хозяин', connected: 'Подключён', emptySlot: 'Ещё {count} свободных мест',
  launch: 'Отправиться на остров', closeRoom: 'Закрыть комнату', leave: 'Выйти из комнаты', cancel: 'Отменить подключение', hostSave: 'Остров сохраняется на устройстве хозяина.',
  connectingTitle: 'Готовим место для вас…', connectingIntro: 'Подключаемся к острову друга. Это может занять некоторое время.',
  guestTitle: 'Вас пригласили.', guestIntro: 'Ждём, когда хозяин отправится на остров.',
  watchTitle: 'Посмотрим, что они создают.', watchIntro: 'Подключаемся для просмотра.',
  pause: 'Остановить фон', resume: 'Продолжить фон', location: 'Остров Sunline', locationDetail: 'Время исследовать. Время создавать.',
  help: 'Помощь с подключением', helpIntro: 'Если код не работает, можно обменяться текстом подключения.',
  manualHost: 'Создать текст подключения', manualGuest: 'Использовать текст подключения', manualHostTitle: 'Пригласите друга напрямую.', manualGuestTitle: 'Встреча без кода комнаты.',
  offer: '1. Отправьте этот текст другу', answer: '2. Вставьте ответ друга', pasteOffer: '1. Вставьте текст от друга',
  createAnswer: 'Создать ответ', copyAnswer: 'Копировать ответ', answerReady: '2. Отправьте ответ другу', acceptAnswer: 'Подключить друга', nextInvite: 'Пригласить ещё друга',
  busy: 'Подождите…', tryAgain: 'Попробовать снова', of: '{current} из {max}', island: 'Остров {name}', online: 'Ищем открытые острова…',
};
export function friendsMenuText(language: CoopLanguage, key: keyof Text, params: Record<string, string | number> = {}) {
  return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), (language === 'ru' ? ru : en)[key]);
}

const connection: Partial<Record<CoopTextKey, [string, string]>> = {
  'status.spectating': ['Joining as a viewer…', 'Подключаемся для просмотра…'],
  'status.waitingHost': ["You're connected. Waiting for the host.", 'Вы подключены. Ждём хозяина.'],
  'status.joined': ['{name} joined your island.', '{name} присоединился к острову.'],
  'status.initializing': ['Opening your island…', 'Открываем ваш остров…'],
  'status.frequencyActive': ['Your room is ready for friends.', 'Комната готова для друзей.'],
  'status.infiltrating': ['Joining as a viewer…', 'Подключаемся для просмотра…'],
  'status.connectingHost': ["Connecting to {name}'s island…", 'Подключаемся к острову {name}…'],
  'status.generatingOffer': ['Preparing connection text…', 'Готовим текст подключения…'],
  'status.offerReady': ['Send this text to a friend, then paste their reply below.', 'Отправьте текст другу и вставьте его ответ ниже.'],
  'status.creatingAnswer': ['Preparing your reply…', 'Готовим ваш ответ…'],
  'status.answerReady': ['Send this reply back to the host.', 'Отправьте ответ хозяину.'],
  'status.directConnected': ['Your friend is connected.', 'Ваш друг подключён.'],
  'error.callsign': ['Choose a name with at least 2 letters or numbers.', 'Введите имя из двух или более букв или цифр.'],
  'error.signalInterrupted': ['The connection was interrupted. Please try again.', 'Связь прервалась. Попробуйте снова.'],
  'error.initialize': ["We couldn't open your island. Please try again.", 'Не удалось открыть остров. Попробуйте снова.'],
  'error.timeout': ["We couldn't reach that island. Check the code or ask your friend to reopen their room.", 'Не удалось связаться с островом. Проверьте код или попросите друга открыть комнату снова.'],
  'error.offline': ['That island is no longer online. Try another room or code.', 'Этот остров больше недоступен. Попробуйте другую комнату или код.'],
  'error.invalidCode': ['Enter a room code or a Friends invite link.', 'Введите код комнаты или ссылку режима друзей.'],
  'error.copyLink': ["Couldn't copy the link. You can select and copy the room code instead.", 'Не удалось скопировать ссылку. Выделите и скопируйте код комнаты.'],
  'error.copyCode': ["Couldn't copy. Select the code and copy it manually.", 'Не удалось скопировать. Выделите код и скопируйте его вручную.'],
  'error.squadFull': ['That room is full.', 'В комнате нет свободных мест.'],
  'error.negotiate': ["We couldn't connect. Try again or open Connection help.", 'Не удалось подключиться. Попробуйте снова или откройте помощь.'],
};
export function friendsConnectionText(language: CoopLanguage, key: CoopTextKey, params: Record<string, string | number> = {}) {
  const pair = connection[key];
  if (!pair) return undefined;
  return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), pair[language === 'ru' ? 1 : 0]);
}
