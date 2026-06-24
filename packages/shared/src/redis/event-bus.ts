import type Redis from 'ioredis';

const CHANNEL_TASK_COMPLETED = 'channel:task.completed';
const CHANNEL_TASK_FAILED = 'channel:task.failed';

export interface TaskEvent {
  taskStateId: string;
  executionId: string;
  timestamp: number;
}

export class EventBus {
  constructor(
    private publisher: Redis,
    private subscriber: Redis,
  ) {}

  /** Publish a task completed event */
  async publishTaskCompleted(taskStateId: string, executionId: string): Promise<void> {
    const event: TaskEvent = {
      taskStateId,
      executionId,
      timestamp: Date.now(),
    };
    await this.publisher.publish(CHANNEL_TASK_COMPLETED, JSON.stringify(event));
  }

  /** Publish a task failed event */
  async publishTaskFailed(taskStateId: string, executionId: string): Promise<void> {
    const event: TaskEvent = {
      taskStateId,
      executionId,
      timestamp: Date.now(),
    };
    await this.publisher.publish(CHANNEL_TASK_FAILED, JSON.stringify(event));
  }

  /** Subscribe to a channel and invoke handler on each message */
  async subscribe(channel: string, handler: (event: TaskEvent) => void): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch: string, message: string) => {
      if (ch === channel) {
        const event = JSON.parse(message) as TaskEvent;
        handler(event);
      }
    });
  }
}
