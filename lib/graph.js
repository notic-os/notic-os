const https = require("https");
const querystring = require("querystring");

async function getGraphToken({ tenantId, clientId, clientSecret }) {
  const postData = querystring.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials"
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: "POST",
      host: "login.microsoftonline.com",
      path: `/${tenantId}/oauth2/v2.0/token`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData)
      }
    }, res => {
      let data = "";
      res.on("data", c => (data += c));
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data).access_token);
        } else reject(new Error(`Token error: ${res.statusCode}`));
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function sendViaGraph({ tenantId, clientId, clientSecret, sender, to, subject, html }) {
  // 'to' may be a string or an array; normalize to array
  const recipients = Array.isArray(to) ? to : (to ? [to] : []);
  const token = await getGraphToken({ tenantId, clientId, clientSecret });

  const payload = JSON.stringify({
    message: {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: recipients.map(address => ({ emailAddress: { address } }))
    },
    saveToSentItems: true
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: "POST",
      host: "graph.microsoft.com",
      path: `/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Authorization: `Bearer ${token}`
      }
    }, res =>
      res.statusCode === 202 ? resolve() : reject(new Error(`Graph send error: ${res.statusCode}`))
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { sendViaGraph };
