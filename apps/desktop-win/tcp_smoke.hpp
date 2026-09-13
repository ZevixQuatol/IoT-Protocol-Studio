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
    container.querySelector('.tcp-send-footer button').click();
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
    await command('tcp-1', 'destroy');
    window.iotpsSmokeResult('pass');
  } catch (error) { window.iotpsSmokeResult(String(error)); }
});
)js";
