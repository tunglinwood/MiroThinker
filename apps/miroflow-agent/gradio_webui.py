#!/usr/bin/env python3
"""
Simple Gradio Web UI for MiroThinker
Uses the same backend as miroflow-agent (FastGPT)
"""

import os
import subprocess
import threading
import time
import uuid
from pathlib import Path

import gradio as gr

# Configuration from miroflow-agent
TASK = ""
RESULT = {}
STATUS = "idle"

def run_mirothinker(task: str, progress=gr.Progress()):
    """Run MiroThinker task and yield progress"""
    if not task.strip():
        yield "Please enter a research task"
        return
    
    progress(0, desc="Starting MiroThinker...")
    
    # Run miroflow-agent in background
    env = os.environ.copy()
    env["TASK"] = task
    
    # Get most recent log file before starting
    log_dir = Path("/root/learning/MiroThinker/logs/debug")
    existing_logs = sorted(log_dir.glob("task_task_example_*.json")) if log_dir.exists() else []
    last_log_mtime = max([f.stat().st_mtime for f in existing_logs]) if existing_logs else 0
    
    # Start the process
    try:
        proc = subprocess.Popen(
            [".venv312/bin/python", "main.py", "llm=openclaw"],
            cwd="/root/learning/MiroThinker/apps/miroflow-agent",
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except Exception as e:
        yield f"Error starting MiroThinker: {str(e)}"
        return
    
    # Wait for completion
    progress(0.1, desc="Researching...")
    
    # Poll for results
    max_wait = 300  # 5 minutes
    waited = 0
    while waited < max_wait:
        time.sleep(5)
        waited += 5
        
        # Check if process exited early
        ret = proc.poll()
        if ret is not None:
            # Process finished, check for errors
            stderr = proc.stderr.read().decode() if proc.stderr else ""
            if stderr:
                yield f"Error: {stderr[:500]}"
                return
        
        # Check for NEW log files (created after we started)
        try:
            logs = sorted(log_dir.glob("task_task_example_*.json"))
            for log in reversed(logs):
                if log.stat().st_mtime > last_log_mtime:
                    # This is a new log file
                    try:
                        import json
                        with open(log) as f:
                            data = json.load(f)
                            status = data.get("status", "")
                            if status == "success":
                                progress(0.9, desc="Finalizing...")
                                result = data.get("final_boxed_answer", "No result")
                                yield result
                                return
                            elif status == "failed" or status == "error":
                                yield "Error: Task failed"
                                return
                    except Exception as e:
                        pass
        except Exception as e:
            pass
        
        progress(min(0.1 + waited/250, 0.8), desc=f"Researching... ({waited}s)")
    
    # Timeout - try to kill process
    try:
        proc.terminate()
        proc.wait(timeout=5)
    except:
        proc.kill()
    yield "Task timed out after 5 minutes"

# Create Gradio interface
with gr.Blocks(title="MiroThinker Research") as demo:
    gr.Markdown("# 🔬 MiroThinker - AI Research Assistant")
    gr.Markdown("Research compounds, drugs, and pharmaceutical information using AI.")
    
    with gr.Row():
        with gr.Column(scale=3):
            task_input = gr.Textbox(
                label="Research Task",
                placeholder="e.g., Research compound HRS-7535: Find company, stage, clinical trials...",
                lines=3
            )
        with gr.Column(scale=1):
            submit_btn = gr.Button("🔍 Research", variant="primary")
    
    with gr.Row():
        result_output = gr.JSON(label="Result")
    
    submit_btn.click(
        fn=run_mirothinker,
        inputs=[task_input],
        outputs=[result_output]
    )
    
    gr.Examples(
        examples=[
            ["Research compound HRS-7535: Find company, stage, chemical identifiers, clinical trials, PubMed papers. Output JSON."],
            ["Research compound MDR-001: Find company, development stage, clinical trials."],
            ["What is SAL0112 compound? Provide company and development stage."],
        ],
        inputs=[task_input],
    )

if __name__ == "__main__":
    print("Starting MiroThinker Gradio UI...")
    print("Open http://174.1.21.3:7862 in your browser")
    demo.launch(server_name="0.0.0.0", server_port=7862)