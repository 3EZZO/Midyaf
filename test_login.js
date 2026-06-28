fetch('http://localhost:5005/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@midyaf.local', password: 'adminalmas' })
})
.then(async r => {
  console.log('Status:', r.status);
  console.log('Body:', await r.text());
})
.catch(console.error);
