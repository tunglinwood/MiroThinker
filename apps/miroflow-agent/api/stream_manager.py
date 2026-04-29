# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""Stream manager for SSE (Server-Sent Events) broadcasting."""

import asyncio
from typing import Dict, Set


class StreamManager:
    """Manages per-task SSE event queues for real-time streaming."""

    def __init__(self):
        # For each task_id: set of asyncio.Queue subscribers
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        # For each task_id: buffered events (new subscribers get recent history)
        self._buffer: Dict[str, list[dict]] = {}
        self._buffer_max = 500

    def subscribe(self, task_id: str) -> asyncio.Queue:
        """Subscribe to events for a task. Returns a queue. Existing events are buffered."""
        if task_id not in self._subscribers:
            self._subscribers[task_id] = set()
            self._buffer.setdefault(task_id, [])

        queue: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self._subscribers[task_id].add(queue)

        # Replay recent events from buffer to new subscriber
        for event in self._buffer[task_id]:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                break

        return queue

    def unsubscribe(self, task_id: str, queue: asyncio.Queue) -> None:
        """Remove a subscriber queue."""
        if task_id in self._subscribers:
            self._subscribers[task_id].discard(queue)
            if not self._subscribers[task_id]:
                del self._subscribers[task_id]

    async def publish(self, task_id: str, event: dict) -> None:
        """Publish an event to all subscribers and buffer it."""
        # Buffer the event
        if task_id not in self._buffer:
            self._buffer[task_id] = []
        self._buffer[task_id].append(event)
        if len(self._buffer[task_id]) > self._buffer_max:
            self._buffer[task_id] = self._buffer[task_id][-self._buffer_max:]

        # Broadcast to subscribers
        subscribers = self._subscribers.get(task_id, set())
        for queue in list(subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # Remove slow subscriber
                subscribers.discard(queue)

    def cleanup(self, task_id: str) -> None:
        """Clean up all subscribers and buffer for a completed task."""
        # Send sentinel to all subscribers
        for queue in list(self._subscribers.get(task_id, set())):
            try:
                queue.put_nowait(None)  # Sentinel: stream ended
            except asyncio.QueueFull:
                pass

        # Remove subscribers but keep buffer for late joiners
        if task_id in self._subscribers:
            del self._subscribers[task_id]

        # Clean buffer after delay (for late subscribers)
        # Buffer is cleaned up by _clean_expired_buffer

    async def drain_queue_to_subscribers(
        self,
        task_id: str,
        source_queue: asyncio.Queue,
    ) -> None:
        """Consume events from a task's source queue and publish to subscribers."""
        try:
            while True:
                event = await source_queue.get()
                if event is None:
                    # Sentinel from source: pipeline finished
                    break
                await self.publish(task_id, event)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            await self.publish(task_id, {"event": "error", "data": {"error": str(e)}})



# Global instance
_stream_manager: StreamManager | None = None


def get_stream_manager() -> StreamManager:
    """Get the global StreamManager instance."""
    global _stream_manager
    if _stream_manager is None:
        _stream_manager = StreamManager()
    return _stream_manager
