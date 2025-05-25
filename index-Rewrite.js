import app from './src/app.js';
import { fetchThreads } from './src/services/threadService.js';

const PORT = process.env.PORT || 3000;

fetchThreads()
    .then(threads => console.log("Loaded threads: ", threads))
    .catch(err, console.log(err));

app.listen(PORT, () => {
    console.log(`Server is running on ${PORT}`);
})