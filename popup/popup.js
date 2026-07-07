document.getElementById('open').addEventListener('click', async () => {
  await chrome.tabs.create({ url: 'https://chatgpt.com/' });
  window.close();
});
