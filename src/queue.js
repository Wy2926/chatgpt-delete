/**
 * 串行限速任务队列：固定间隔执行，429 时按 Retry-After / 指数退避自动重试。
 */
(function () {
  'use strict';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  class TaskQueue {
    /**
     * @param {object} opts
     * @param {number} opts.interval    每个任务之间的最小间隔 (ms)
     * @param {number} opts.maxRetries  单个任务最大自动重试次数
     * @param {number} opts.baseBackoff 429/网络错误时的基础退避 (ms)
     */
    constructor({ interval = 350, maxRetries = 3, baseBackoff = 2000 } = {}) {
      this.interval = interval;
      this.maxRetries = maxRetries;
      this.baseBackoff = baseBackoff;
      this.aborted = false;
      this.paused = false;
    }

    abort() { this.aborted = true; }

    pause() { this.paused = true; }

    resume() { this.paused = false; }

    async _waitIfPaused() {
      while (this.paused && !this.aborted) await sleep(200);
    }

    /**
     * 顺序执行任务。
     * @param {Array<{id:string, run:Function}>} tasks
     * @param {object} cb
     * @param {Function} [cb.onItemStart]  (task)
     * @param {Function} [cb.onItemDone]   (task)
     * @param {Function} [cb.onItemError]  (task, error, willRetry)
     * @param {Function} [cb.onItemRetryWait] (task, waitMs, attempt)
     * @returns {{done:string[], failed:Array<{id:string, error:Error}>, aborted:boolean}}
     */
    async run(tasks, cb = {}) {
      this.aborted = false;
      this.paused = false;
      const done = [];
      const failed = [];

      for (const task of tasks) {
        if (this.aborted) break;
        await this._waitIfPaused();
        if (this.aborted) break;

        if (cb.onItemStart) cb.onItemStart(task);
        let lastError = null;
        let success = false;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
          if (this.aborted) break;
          try {
            await task.run();
            success = true;
            break;
          } catch (err) {
            lastError = err;
            const retriable = err && (err.status === 429 || err.status >= 500 || err.name === 'TypeError');
            const willRetry = retriable && attempt < this.maxRetries;
            if (cb.onItemError) cb.onItemError(task, err, willRetry);
            if (!willRetry) break;
            const wait = err.retryAfterMs != null
              ? err.retryAfterMs + 500
              : this.baseBackoff * Math.pow(2, attempt);
            if (cb.onItemRetryWait) cb.onItemRetryWait(task, wait, attempt + 1);
            await sleep(wait);
            await this._waitIfPaused();
          }
        }

        if (success) {
          done.push(task.id);
          if (cb.onItemDone) cb.onItemDone(task);
        } else if (!this.aborted) {
          failed.push({ id: task.id, error: lastError });
        }

        if (!this.aborted) await sleep(this.interval);
      }

      return { done, failed, aborted: this.aborted };
    }
  }

  window.CGPTBulk = window.CGPTBulk || {};
  window.CGPTBulk.TaskQueue = TaskQueue;
})();
