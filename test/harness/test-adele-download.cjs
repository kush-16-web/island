const https = require('https');

const url = 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/bf/2d/a9/bf2da9a8-e4b2-299d-16f3-1634b17bfb4a/886443027814.jpg/1000x1000bb.jpg';

https.get(url, (res) => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const buf = Buffer.concat(chunks);
    console.log('Downloaded image bytes:', buf.length);
  });
});
