// ./index.js
import app from "./src/app.js";
import { fetchThreads } from "./src/services/threadService.js";


const PORT = process.env.PORT || 3000;

// مثال: اعرض النتائج بالكونسول عند بدء التشغيل
fetchThreads()
  .then(threads => console.log("Loaded threads:", threads))
  .catch(err => console.error(err));

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});