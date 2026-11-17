# Fastfix Mobile Lab — Standalone Sub-Admin Portal

এই প্রজেক্টটি আপনার মেইন অ্যাপের লাইভ Firebase Firestore ডাটাবেসের সাথে সংযুক্ত একটি আলাদা **Sub-Admin & Technician Portal**।

## GitHub ও Netlify-তে Deploy করার নিয়ম

1. এই ZIP ফাইলটি Unzip করুন এবং একটি নতুন GitHub Repository-তে সব ফাইল Upload/Push করুন।
2. [Netlify](https://app.netlify.com)-এ লগইন করে **Add new site -> Import an existing project -> GitHub** থেকে আপনার Repository সিলেক্ট করুন।
3. Build settings (অটোমেটিক `netlify.toml` থেকে নেবে):
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. **Deploy site** বাটনে ক্লিক করুন।
5. Deploy হওয়ার পর পাওয়া Netlify ডোমেইনটি (যেমন: `your-subadmin.netlify.app`) Firebase Console -> **Authentication -> Settings -> Authorized domains**-এ যোগ করুন।
6. নিশ্চিত করুন Firebase Console -> **Authentication -> Sign-in method**-এ **Email/Password** চালু আছে।
