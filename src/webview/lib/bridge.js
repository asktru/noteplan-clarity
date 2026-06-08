/* global sendMessageToPlugin, npWindowID */
// receivingPluginID and npWindowID are set in the inline script before the bridge
// loads. Route every outgoing message through sendToPlugin so each payload carries
// the originating window's ID; the plugin replies to that window (sidebar embed vs.
// separate floating window). sendMessageToPlugin is `const` in the bridge and can't
// be monkey-patched, so we wrap it.
export function sendToPlugin(action, data) {
  try {
    var d = data ? JSON.parse(data) : {};
    if (typeof npWindowID !== 'undefined' && npWindowID && d._windowID === undefined) d._windowID = npWindowID;
    data = JSON.stringify(d);
  } catch (e) {}
  return sendMessageToPlugin(action, data);
}
