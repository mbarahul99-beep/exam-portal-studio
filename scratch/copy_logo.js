import fs from 'fs';

try {
  fs.copyFileSync(
    'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\c8b074ad-077b-46f3-b977-d7ef0b1974ac\\.user_uploaded\\media_1785750613393.png',
    'public/omr_logo.png'
  );
  console.log("Successfully copied logo image to public/omr_logo.png!");
} catch (e) {
  console.error("Failed to copy logo image:", e);
}
