#pragma once

constexpr auto tcp_smoke_script = R"js(
window.addEventListener('DOMContentLoaded', async () => {
  const check = (ok, reason) => { if (!ok) throw new Error(reason); };
  const wait = async (predicate, reason) => {
    const end = Date.now() + 6000;
    while (!(await predicate())) {
      check(Date.now() < end, reason);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  const command = async (id, action, ...args) => {
    const result = await window.iotpsTcp(id, action, ...args);
    check(result.ok, `${action}: ${result.error?.message}`);
    return result;
  };
  try {
    await wait(() => document.querySelector('.tcp-button'), 'TCP navigation rendered');
    document.querySelector('.tcp-button').click();
    await command('tcp-1', 'create');
    await command('smoke-client', 'create');
    let port;
    for (let attempt = 0; attempt < 10; ++attempt) {
      port = String(20000 + (Date.now() % 25000));
      await command('tcp-1', 'start', 'server', '127.0.0.1', port);
      await wait(async () => (await command('tcp-1', 'poll', '0')).state !== 'opening', 'listener startup');
      if ((await command('tcp-1', 'poll', '0')).state === 'open') break;
    }
    check((await command('tcp-1', 'poll', '0')).state === 'open', 'listener ready');
    await command('smoke-client', 'start', 'client', '127.0.0.1', port);
    await wait(async () => (await command('tcp-1', 'poll', '0')).peers.length === 1, 'same-process client connection');
    const client = await command('smoke-client', 'poll', '0');
    const server = await command('tcp-1', 'poll', '0');
    await command('smoke-client', 'send', String(client.peers[0].id), '00 FF 80');
    await wait(async () => (await command('tcp-1', 'poll', '0')).received === 3, 'same-process receive');
    const container = document.querySelector('[data-session="tcp-1"]');
    await wait(() => container.querySelector('.tcp-dir-RX'), 'live RX rendered');
    const exported = await command('tcp-1', 'export');
    check(exported.records.some(r => r.direction === 'RX' && r.hex === '00 FF 80'), 'native export retains raw bytes');
    check([...container.querySelectorAll('.tcp-log-toolbar button')].some(b => b.textContent.includes('保存') || b.textContent.includes('Save')), 'traffic export control');
    check(!(await window.iotpsTrafficFile('invalid', '')).ok, 'traffic file request validation');
    check(!(await window.iotpsLogFile('invalid', '')).ok, 'log file request validation');
    const payload = container.querySelector('textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(payload, '12 34');
    payload.dispatchEvent(new Event('input', { bubbles: true }));
    const open = window.open.bind(window);
    let popup;
    window.open = (...args) => { popup = open(...args); return popup; };
    const detach = async () => {
      document.querySelector('.tcp-tab button:last-child').click();
      await wait(() => document.querySelector('.tcp-workspace > dialog[open]'), 'session action menu');
      document.querySelector('.tcp-workspace > dialog .tree-dialog-actions button').click();
      await wait(() => popup && !popup.closed && popup.document.body.contains(container), 'native popup DOM');
      check(await window.iotpsSmokeTcpWindows('count') === 1, 'one native child HWND');
      check(container.querySelector('textarea') === payload && payload.value === '12 34', 'draft and DOM preserved');
      check(popup.getComputedStyle(container).display === 'flex', 'packaged popup styles loaded');
    };
    await detach();
    await command('smoke-client', 'send', String(client.peers[0].id), 'AA BB');
    await wait(() => container.querySelectorAll('.tcp-dir-RX').length >= 2, 'receive continues detached');
    // Exercise React delegated events in the adopted popup DOM, not just bridge calls.
    container.querySelector('.tcp-send-footer [data-action="send"]').click();
    await wait(async () => (await command('smoke-client', 'poll', '0')).received === 2, 'popup send handler');
    container.querySelector('.tcp-popup-toolbar button').click();
    await wait(() => container.ownerDocument === document && popup.closed, 'dock from popup');
    check(payload.value === '12 34', 'draft retained after docking');
    check((await command('tcp-1', 'poll', '0')).peers[0].id === server.peers[0].id, 'connection unchanged by docking');
    await detach();
    await window.iotpsSmokeTcpWindows('close');
    await wait(async () => container.ownerDocument === document && await window.iotpsSmokeTcpWindows('count') === 0, 'native close docks without quitting');
    check((await command('tcp-1', 'poll', '0')).state === 'open', 'native close keeps listener');
    await command('smoke-client', 'clear');
    check((await command('tcp-1', 'poll', '0')).records.length > 0, 'session records isolated');
    await command('smoke-client', 'destroy');
    check(!(await window.iotpsTcp('smoke-client', 'poll', '0')).ok, 'closed session not resurrected');
    check((await command('tcp-1', 'poll', '0')).state === 'open', 'other session stays open');
      // P15 uses the same portal in client mode, with a themed close confirmation.
      document.querySelector('.tcp-add').click();
      await wait(() => document.querySelector('[data-session="tcp-2"] textarea'), 'second session mounted');
      const clientContainer = document.querySelector('[data-session="tcp-2"]');
      const clientForm = clientContainer.querySelector('.tcp-connect');
      const clientPort = clientForm.querySelector('input[aria-label="端口"], input[aria-label="Port"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(clientPort, String(server.port));
      clientPort.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(() => clientPort.value === String(server.port), 'client port edited');
      clientForm.requestSubmit();
      await wait(async () => (await command('tcp-2', 'poll', '0')).state === 'open', 'second client connected');
      document.querySelector('.tcp-tab.active button:last-child').click();
      await wait(() => document.querySelector('.tcp-workspace > dialog[open]'), 'client session menu');
      document.querySelector('.tcp-workspace > dialog .tree-dialog-actions button').click();
      await wait(() => popup && !popup.closed && popup.document.body.contains(clientContainer), 'client popup DOM');
      check(clientContainer.querySelector('.tcp-popup-workbench'), 'P15 detached client layout');
      check(!clientContainer.querySelector('.session-close-dialog').open, 'close dialog initially hidden');
      const newPeer = (await command('tcp-1', 'poll', '0')).peers.find(p => p.id !== server.peers[0].id);
      check(newPeer, 'second client is independently connected');
      await command('tcp-1', 'send', String(newPeer.id), 'CC DD');
      await wait(() => clientContainer.querySelector('.tcp-dir-RX'), 'P15 receive continues');
      clientContainer.querySelector('.tcp-log tbody tr').click();
      await wait(() => clientContainer.querySelector('.tcp-popup-message'), 'P15 message detail');
      clientContainer.querySelector('.tcp-detail-panel .tcp-panel-heading button:last-child').click();
      await wait(() => clientContainer.querySelector('.details-collapsed'), 'P15 detail collapsed');
      clientContainer.querySelector('.tcp-detail-rail').click();
      await wait(() => !clientContainer.querySelector('.details-collapsed'), 'P15 detail expanded');
      const closeButton = clientContainer.querySelector('.tcp-popup-close');
      closeButton.click();
      await wait(() => clientContainer.querySelector('.session-close-dialog').open, 'P15 close confirmation');
      clientContainer.querySelector('.session-close-dialog footer button').click();
      await wait(() => !clientContainer.querySelector('.session-close-dialog').open, 'P15 cancel close');
      check((await command('tcp-2', 'poll', '0')).state === 'open', 'cancel keeps live connection');
      closeButton.click();
      await wait(() => clientContainer.querySelector('.session-close-dialog').open, 'P15 reopen close confirmation');
      clientContainer.querySelector('.session-close-confirm').click();
      await wait(async () => !popup || popup.closed, 'P15 confirmed close removes child window');
      check(!(await window.iotpsTcp('tcp-2', 'poll', '0')).ok, 'P15 confirmed close destroys only its session');
      check((await command('tcp-1', 'poll', '0')).state === 'open', 'P15 close leaves listener running');
    await command('tcp-1', 'destroy');
    window.iotpsSmokeResult('pass');
  } catch (error) { window.iotpsSmokeResult(String(error)); }
});
)js";
