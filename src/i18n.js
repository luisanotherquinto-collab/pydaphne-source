/* ==========================================================================
 *  Idiomas del receptor: 1 English · 2 Español · 3 中文 · 4 日本語 · 5 Русский
 *  La interfaz se escribe en español y se traduce sobre la marcha: un
 *  MutationObserver cambia cada texto (y placeholder) que coincida con el
 *  diccionario. La voz Votrax de la guía usa las palabras de cada idioma.
 * ========================================================================== */
'use strict';
const LANGS = [['en', 'English'], ['es', 'Español'], ['zh', '中文'], ['ja', '日本語'], ['ru', 'Русский']];
/* español → [en, zh, ja, ru] */
const I18N = {
  'Lista de canales': ['Channel list', '频道列表', 'チャンネル一覧', 'Список каналов'],
  'TODOS': ['ALL', '全部', 'すべて', 'ВСЕ'],
  'Jugador': ['Player', '玩家', 'プレイヤー', 'Игрок'],
  'Cambiar perfil': ['Switch profile', '切换用户', 'プロフィール変更', 'Сменить профиль'],
  'Elegir perfil': ['Choose profile', '选择用户', 'プロフィール選択', 'Выбрать профиль'],
  'Sin señal': ['No signal', '无信号', '信号なし', 'Нет сигнала'],
  'OK ver canal': ['OK watch channel', 'OK 观看频道', 'OK チャンネルを見る', 'OK смотреть канал'],
  'I información': ['I information', 'I 信息', 'I 情報', 'I информация'],
  'M menú': ['M menu', 'M 菜单', 'M メニュー', 'M меню'],
  'R récords · P jugador': ['R high scores · P player', 'R 排行榜 · P 玩家', 'R ハイスコア · P プレイヤー', 'R рекорды · P игрок'],
  'Tab salir': ['Tab exit', 'Tab 退出', 'Tab 戻る', 'Tab выход'],
  'MONEDA': ['COIN', '投币', 'コイン', 'МОНЕТА'],
  'INICIO': ['START', '开始', 'スタート', 'СТАРТ'],
  'ACCIÓN': ['ACTION', '动作', 'アクション', 'ДЕЙСТВИЕ'],
  'RECARGAR': ['RELOAD', '装弹', 'リロード', 'ПЕРЕЗАРЯДКА'],
  'FUNDA': ['HOLSTER', '枪套', 'ホルスター', 'КОБУРА'],
  'INICIO 2': ['START 2', '开始 2', 'スタート 2', 'СТАРТ 2'],
  'Versión': ['Version', '版本', 'バージョン', 'Версия'],
  'Cargar laserdisc': ['Load laserdisc', '载入光碟', 'レーザーディスクを読み込む', 'Загрузить лазердиск'],
  'Cambiar laserdisc': ['Change laserdisc', '更换光碟', 'レーザーディスクを交換', 'Сменить лазердиск'],
  'Cuadro inicial': ['Start frame', '起始帧', '開始フレーム', 'Начальный кадр'],
  'La máquina ya está corriendo. Carga el laserdisc en mp4 (o el framefile .txt junto con sus videos) para ver el video debajo del overlay.':
    ['The machine is already running. Load the laserdisc as mp4 (or the .txt framefile with its videos) to see the video under the overlay.',
     '机器已经在运行。载入 mp4 格式的光碟（或 .txt 帧文件及其视频），即可在画面下方看到影像。',
     'マシンはすでに動いています。レーザーディスクの mp4（または .txt フレームファイルと動画）を読み込むと、オーバーレイの下に映像が出ます。',
     'Машина уже работает. Загрузите лазердиск в mp4 (или файл кадров .txt с видео), чтобы увидеть видео под графикой.'],
  'Sin video: el juego corre solo con overlay.': ['No video: the game runs with the overlay only.', '无影像：游戏只显示叠加画面。', '映像なし：オーバーレイだけで動いています。', 'Без видео: игра идёт только с графикой.'],
  '¿Quién está viendo?': ['Who’s watching?', '谁在观看？', 'だれが見ていますか？', 'Кто смотрит?'],
  'Agregar perfil': ['Add profile', '添加用户', 'プロフィール追加', 'Добавить профиль'],
  'ADMINISTRAR PERFILES': ['MANAGE PROFILES', '管理用户', 'プロフィール管理', 'УПРАВЛЕНИЕ ПРОФИЛЯМИ'],
  'Administrar perfiles': ['Manage profiles', '管理用户', 'プロフィール管理', 'Управление профилями'],
  'LISTO': ['DONE', '完成', '完了', 'ГОТОВО'],
  'Nuevo perfil': ['New profile', '新用户', '新しいプロフィール', 'Новый профиль'],
  'Editar perfil': ['Edit profile', '编辑用户', 'プロフィール編集', 'Изменить профиль'],
  'Importar imagen…': ['Import image…', '导入图片…', '画像を読み込む…', 'Загрузить картинку…'],
  'Quitar imagen': ['Remove image', '移除图片', '画像を消す', 'Убрать картинку'],
  'Guardar': ['Save', '保存', '保存', 'Сохранить'],
  'Cancelar': ['Cancel', '取消', 'キャンセル', 'Отмена'],
  'Borrar': ['Delete', '删除', '削除', 'Удалить'],
  'No guardar': ['Don’t save', '不保存', '保存しない', 'Не сохранять'],
  'Nombre': ['Name', '名字', '名前', 'Имя'],
  'Puntos': ['Points', '分数', '得点', 'Очки'],
  'Escribe un nombre': ['Type a name', '请输入名字', '名前を入力してください', 'Введите имя'],
  'Ya hay un perfil con ese nombre': ['There is already a profile with that name', '已有同名用户', '同じ名前のプロフィールがあります', 'Профиль с таким именем уже есть'],
  'Hasta 10 perfiles · los récords se guardan en este navegador · control: ◀ ▶ y SELECT':
    ['Up to 10 profiles · high scores are saved in this browser · remote: ◀ ▶ and SELECT', '最多 10 个用户 · 排行榜保存在此浏览器 · 遥控器：◀ ▶ 和 SELECT',
     'プロフィールは10件まで · ハイスコアはこのブラウザに保存 · リモコン：◀ ▶ と SELECT', 'До 10 профилей · рекорды хранятся в этом браузере · пульт: ◀ ▶ и SELECT'],
  'Menú': ['Menu', '菜单', 'メニュー', 'Меню'],
  'Récords': ['High scores', '排行榜', 'ハイスコア', 'Рекорды'],
  'Imagen y sonido': ['Picture and sound', '画面与声音', '映像と音', 'Изображение и звук'],
  'Controles': ['Controls', '操作', '操作', 'Управление'],
  'Biblioteca de ROMs': ['ROM library', 'ROM 库', 'ROM ライブラリ', 'Библиотека ROM'],
  'Canales propios': ['Custom channels', '自定义频道', 'カスタムチャンネル', 'Свои каналы'],
  'Acerca de': ['About', '关于', 'このソフトについて', 'О программе'],
  'Cerrar (M)': ['Close (M)', '关闭 (M)', '閉じる (M)', 'Закрыть (M)'],
  'Idioma': ['Language', '语言', '言語', 'Язык'],
  'Jugador actual:': ['Current player:', '当前玩家：', '現在のプレイヤー：', 'Текущий игрок:'],
  'Cambiar': ['Change', '更换', '変更', 'Сменить'],
  'Ranking total de todos los juegos': ['Overall ranking across all games', '全部游戏总排行', '全ゲーム総合ランキング', 'Общий рейтинг по всем играм'],
  'Por juego': ['Per game', '各游戏', 'ゲーム別', 'По играм'],
  'Juego': ['Game', '游戏', 'ゲーム', 'Игра'],
  'Total': ['Total', '总分', '合計', 'Итого'],
  'Juegos': ['Games', '游戏数', 'ゲーム数', 'Игр'],
  'Mejor juego': ['Best game', '最佳游戏', 'ベストゲーム', 'Лучшая игра'],
  'Fecha': ['Date', '日期', '日付', 'Дата'],
  'Todavía no hay récords.': ['No high scores yet.', '还没有记录。', 'まだ記録がありません。', 'Рекордов пока нет.'],
  'Registrar puntuación del canal actual': ['Record a score for this channel', '登记本频道分数', 'このチャンネルの得点を記録', 'Записать очки этого канала'],
  'Este juego no reporta su puntuación automáticamente.': ['This game does not report its score automatically.', '此游戏不会自动报告分数。', 'このゲームは得点を自動で送りません。', 'Эта игра не сообщает очки автоматически.'],
  'Sintoniza un juego primero': ['Tune to a game first', '请先选择一个游戏', '先にゲームを選んでください', 'Сначала выберите игру'],
  'Líneas de barrido CRT': ['CRT scanlines', 'CRT 扫描线', 'CRT 走査線', 'Строки развёртки ЭЛТ'],
  'Voz Votrax SC-01A en la guía de canales': ['Votrax SC-01A voice in the channel guide', '频道指南中的 Votrax SC-01A 语音', 'チャンネルガイドで Votrax SC-01A の声', 'Голос Votrax SC-01A в телегиде'],
  'Agregar canal HTML': ['Add HTML channel', '添加 HTML 频道', 'HTML チャンネル追加', 'Добавить HTML-канал'],
  'Todavía no hay canales propios.': ['No custom channels yet.', '还没有自定义频道。', 'カスタムチャンネルはまだありません。', 'Своих каналов пока нет.'],
  'Guía de canales': ['Channel guide', '频道指南', 'チャンネルガイド', 'Телегид'],
  'Información del canal': ['Channel information', '频道信息', 'チャンネル情報', 'Информация о канале'],
  'Número de canal': ['Channel number', '频道号码', 'チャンネル番号', 'Номер канала'],
  'Canal + / −': ['Channel + / −', '频道 + / −', 'チャンネル + / −', 'Канал + / −'],
  'Botón 1 / 2 / 3': ['Button 1 / 2 / 3', '按钮 1 / 2 / 3', 'ボタン 1 / 2 / 3', 'Кнопка 1 / 2 / 3'],
  'Requiere servidor local': ['Needs a local server', '需要本地服务器', 'ローカルサーバーが必要', 'Нужен локальный сервер']
};
const I18N_IDX = { en: 0, zh: 1, ja: 2, ru: 3 };
const I18N_REV = {};      /* texto traducido → original, para poder cambiar de idioma otra vez */
for (const k in I18N) I18N[k].forEach(v => { I18N_REV[v] = k; });
let curLang = 'es';
function tr(s, lang) {
  lang = lang || curLang; const base = I18N_REV[s] || s;
  if (lang === 'es') return base;
  const row = I18N[base]; return row ? row[I18N_IDX[lang]] : s;
}
function translateNode(root) {
  if (!root) return;
  const walk = n => {
    if (n.nodeType === 3) { const raw = n.nodeValue, t = raw.trim(); if (t.length > 1) { const x = tr(t); if (x !== t) n.nodeValue = raw.replace(t, x); } return; }
    if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'IFRAME') return;
    if (n.placeholder) { const x = tr(n.placeholder); if (x !== n.placeholder) n.placeholder = x; }
    if (n.title && I18N_REV[n.title] === undefined && I18N[n.title]) n.title = tr(n.title);
    for (const c of n.childNodes) walk(c);
  };
  walk(root);
}
let i18nObs = null, i18nBusy = false;
function setLang(lang) {
  curLang = LANGS.some(l => l[0] === lang) ? lang : 'es';
  document.documentElement.lang = curLang;
  i18nBusy = true; translateNode(document.body); i18nBusy = false;
  if (!i18nObs) {
    i18nObs = new MutationObserver(ms => {
      if (i18nBusy) return; i18nBusy = true;
      for (const m of ms) { if (m.type === 'characterData') translateNode(m.target); for (const n of m.addedNodes) translateNode(n); }
      i18nBusy = false;
    });
    i18nObs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
}
/* palabras para la voz Votrax de la guía (romanizadas: el SC-01 sólo sabe fonemas) */
const VOX = {
  en: { channel: 'channel', digits: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'] },
  es: { channel: 'canal', digits: ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'] },
  zh: { channel: 'pindao', digits: ['ling', 'yi', 'er', 'san', 'si', 'wu', 'liu', 'chi', 'ba', 'yiu'] },
  ja: { channel: 'chaneru', digits: ['zero', 'ichi', 'ni', 'san', 'yon', 'go', 'roku', 'nana', 'hachi', 'kiu'] },
  ru: { channel: 'kanal', digits: ['nol', 'odin', 'dva', 'tri', 'chetyre', 'piat', 'shest', 'sem', 'vosem', 'deviat'] }
};
