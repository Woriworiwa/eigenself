export const environment = {
  production: true,
  // Angular app is served from CloudFront (S3).
  // The API + Socket.IO server runs on EC2 — this must point directly at the EC2
  // instance, NOT at CloudFront. CloudFront does not proxy WebSocket traffic.
  //
  // Options (pick one):
  //   'http://<EC2-PUBLIC-IP>:3000'          — quick, no SSL
  //   'https://api.eigenself.com'            — proper subdomain + SSL (recommended)
  apiUrl: 'http://13.223.248.251:3000',
};
