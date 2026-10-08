// Worker thread of convertMovies (fmv.ts): converts one movie and posts its MovieInfo.

import { parentPort, workerData } from 'node:worker_threads';
import { convertMovie } from './fmv.ts';

const { name, root, quality } = workerData as { name: string; root: string; quality: number };
parentPort?.postMessage(await convertMovie(name, { root, quality }));
