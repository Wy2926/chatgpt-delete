const T = {
  en: { open: 'Open ChatGPT', tip: 'On chatgpt.com, click the floating button at the bottom-right to open the manager panel.' },
  zh_CN: { open: '打开 ChatGPT 并使用', tip: '在 chatgpt.com 页面右下角点击悬浮按钮即可打开管理面板。' },
  zh_TW: { open: '開啟 ChatGPT 並使用', tip: '在 chatgpt.com 頁面右下角點擊懸浮按鈕即可開啟管理面板。' },
  ja: { open: 'ChatGPT を開く', tip: 'chatgpt.com の右下にあるフローティングボタンをクリックすると管理パネルが開きます。' },
  ko: { open: 'ChatGPT 열기', tip: 'chatgpt.com 페이지 오른쪽 아래의 플로팅 버튼을 클릭하면 관리 패널이 열립니다.' },
  es: { open: 'Abrir ChatGPT', tip: 'En chatgpt.com, haz clic en el botón flotante de la esquina inferior derecha para abrir el panel.' },
  fr: { open: 'Ouvrir ChatGPT', tip: 'Sur chatgpt.com, cliquez sur le bouton flottant en bas à droite pour ouvrir le panneau.' },
  de: { open: 'ChatGPT öffnen', tip: 'Klicken Sie auf chatgpt.com unten rechts auf die schwebende Schaltfläche, um das Panel zu öffnen.' },
  pt_BR: { open: 'Abrir o ChatGPT', tip: 'Em chatgpt.com, clique no botão flutuante no canto inferior direito para abrir o painel.' },
  ru: { open: 'Открыть ChatGPT', tip: 'На chatgpt.com нажмите плавающую кнопку в правом нижнем углу, чтобы открыть панель.' },
  it: { open: 'Apri ChatGPT', tip: 'Su chatgpt.com, fai clic sul pulsante fluttuante in basso a destra per aprire il pannello.' },
  id: { open: 'Buka ChatGPT', tip: 'Di chatgpt.com, klik tombol mengambang di kanan bawah untuk membuka panel pengelola.' },
};

const ui = chrome.i18n.getUILanguage().toLowerCase();
let lang = 'en';
if (ui.startsWith('zh')) lang = (ui.includes('tw') || ui.includes('hk') || ui.includes('hant')) ? 'zh_TW' : 'zh_CN';
else if (ui.startsWith('pt')) lang = 'pt_BR';
else if (T[ui.split('-')[0]]) lang = ui.split('-')[0];

document.documentElement.lang = lang.replace('_', '-');
document.getElementById('title').textContent = chrome.i18n.getMessage('appName');
document.getElementById('desc').textContent = chrome.i18n.getMessage('appDesc');
document.getElementById('open').textContent = T[lang].open;
document.getElementById('tip').textContent = T[lang].tip;

document.getElementById('open').addEventListener('click', async () => {
  await chrome.tabs.create({ url: 'https://chatgpt.com/' });
  window.close();
});
