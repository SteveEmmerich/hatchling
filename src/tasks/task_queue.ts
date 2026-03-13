import type { Task } from "./task_types.js";

export class TaskQueue {
  private tasks: Task[] = [];

  constructor(initial: Task[] = []) {
    this.tasks = [...initial];
  }

  size(): number {
    return this.tasks.length;
  }

  list(): Task[] {
    return [...this.tasks];
  }

  enqueue(task: Task): void {
    this.tasks.push(task);
  }

  enqueueMany(tasks: Task[]): void {
    for (const task of tasks) {
      this.tasks.push(task);
    }
  }

  dequeue(): Task | undefined {
    return this.tasks.shift();
  }

  remove(id: string): Task | undefined {
    const index = this.tasks.findIndex((task) => task.id === id);
    if (index === -1) return undefined;
    const [removed] = this.tasks.splice(index, 1);
    return removed;
  }

  clear(): void {
    this.tasks = [];
  }

  peek(): Task | undefined {
    return this.tasks[0];
  }

  replace(tasks: Task[]): void {
    this.tasks = [...tasks];
  }
}
