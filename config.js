module.exports = {
  clientId: process.env.CLIENT_ID || (() => { throw new Error('CLIENT_ID not set'); })(),
  token: process.env.TOKEN || (() => { throw new Error('TOKEN not set'); })(),
};