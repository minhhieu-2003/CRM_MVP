import { AsyncLocalStorage } from "node:async_hooks";

export const sourceContext = new AsyncLocalStorage();
