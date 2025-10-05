// QueueAdapter interface
export class QueueAdapter {
  async enqueue(_queueName, _jobName, _data) {
    throw new Error('Not implemented');
  }

  async close() {}
}
