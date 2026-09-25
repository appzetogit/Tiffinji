import fetch from 'node-fetch';

async function testHttp() {
  const base = 'http://localhost:5001/api/v1/food/restaurant/restaurants';

  const testCases = [
    { name: 'Rewa coords + zoneId', url: `${base}?lat=24.552&lng=81.302&zoneId=6a762e654b893bcccf0d07e7` },
    { name: 'Rewa coords only', url: `${base}?lat=24.552&lng=81.302` },
    { name: 'city=Rewa', url: `${base}?city=Rewa` },
    { name: 'Satna coords + zoneId', url: `${base}?lat=24.571&lng=80.832&zoneId=6a6dd7745cc8ef6a2689391c` },
    { name: 'Bhilai coords + zoneId', url: `${base}?lat=21.19&lng=81.38&zoneId=6a6dd9365cc8ef6a26893989` },
  ];

  for (const tc of testCases) {
    console.log(`\n--- ${tc.name} ---`);
    console.log('Fetching:', tc.url);
    try {
      const res = await fetch(tc.url);
      const data = await res.json();
      console.log('Status:', res.status);
      console.log('Success:', data.success);
      console.log('Total:', data.data?.total);
      console.log('Restaurants:', data.data?.restaurants?.map(r => `${r.restaurantName || r.name} (city:${r.city || r.address?.city}, zone:${r.zoneId})`));
    } catch (err) {
      console.error('Error:', err.message);
    }
  }
}

testHttp();
