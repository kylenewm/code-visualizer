"""Command-line interface for task management."""

import argparse
from task import create_task, mark_complete
from storage import load_tasks, save_tasks, find_task, delete_task
from formatter import format_table, format_json, format_plain, format_summary
from validators import validate_title


def main():
    """Main entry point for the CLI."""
    parser = argparse.ArgumentParser(description="Task Manager CLI")
    subparsers = parser.add_subparsers(dest="command")

    # Add command
    add_parser = subparsers.add_parser("add", help="Add a new task")
    add_parser.add_argument("title", help="Task title")
    add_parser.add_argument("-p", "--priority", default="medium", help="Priority: low/medium/high")

    # List command
    list_parser = subparsers.add_parser("list", help="List tasks")
    list_parser.add_argument("-f", "--format", choices=["table", "json", "plain"], default="table")
    list_parser.add_argument("--filter", choices=["all", "pending", "completed"], default="all")

    # Complete command
    complete_parser = subparsers.add_parser("complete", help="Mark task as done")
    complete_parser.add_argument("task_id", help="Task ID to complete")

    # Delete command
    delete_parser = subparsers.add_parser("delete", help="Delete a task")
    delete_parser.add_argument("task_id", help="Task ID to delete")

    args = parser.parse_args()
    dispatch_command(args)


def dispatch_command(args):
    """Route to appropriate command handler."""
    if args.command == "add":
        add_task_cmd(args.title, args.priority)
    elif args.command == "list":
        list_tasks_cmd(args.format, args.filter)
    elif args.command == "complete":
        complete_task_cmd(args.task_id)
    elif args.command == "delete":
        delete_task_cmd(args.task_id)
    else:
        print("Use --help for available commands")


def add_task_cmd(title: str, priority: str):
    """Handle add task command."""
    if not validate_title(title):
        print("Error: Invalid title")
        return

    task = create_task(title, priority)
    tasks = load_tasks()
    tasks.append(task.__dict__)
    save_tasks(tasks)
    print(f"Created task: {task.id}")


def list_tasks_cmd(fmt: str, filter_by: str):
    """Handle list tasks command."""
    tasks = load_tasks()

    if filter_by == "pending":
        tasks = [t for t in tasks if not t.get("completed")]
    elif filter_by == "completed":
        tasks = [t for t in tasks if t.get("completed")]

    if fmt == "table":
        print(format_table(tasks))
    elif fmt == "json":
        print(format_json(tasks))
    else:
        print(format_plain(tasks))

    print("\n" + format_summary(tasks))


def complete_task_cmd(task_id: str):
    """Handle complete task command."""
    task = find_task(task_id)
    if not task:
        print(f"Task not found: {task_id}")
        return

    task["completed"] = True
    tasks = load_tasks()
    for i, t in enumerate(tasks):
        if t.get("id") == task_id:
            tasks[i] = task
            break
    save_tasks(tasks)
    print(f"Completed: {task['title']}")


def delete_task_cmd(task_id: str):
    """Handle delete task command."""
    if delete_task(task_id):
        print(f"Deleted task: {task_id}")
    else:
        print(f"Task not found: {task_id}")


if __name__ == "__main__":
    main()
