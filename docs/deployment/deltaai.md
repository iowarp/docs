---
sidebar_position: 3
title: DeltaAI (NCSA)
description: Getting started with IOWarp on the NCSA DeltaAI GH200 supercomputer.
---

# Getting Started with DeltaAI

> For IOWarp team members on project CIS250329
> DeltaAI: NVIDIA GH200 Grace Hopper Supercomputer at NCSA

---

## What is DeltaAI?

DeltaAI is a 152-node supercomputer at NCSA, each node packing 4x NVIDIA GH200 superchips (H100 GPU + Grace ARM CPU). Our allocation gives us ~1,000 GPU Hours on H100s with 120GB HBM3 each.

**Important:** DeltaAI runs on **ARM (aarch64)** CPUs, not x86. This affects everything you compile.

---

## Step 1: Get Your Credentials

You need three things before you can log in:

### 1a. NCSA Username
Your PI or allocation manager has already added you to the project. Your NCSA username is typically your university NetID (e.g., `jdoe3`). Check with the PI if unsure.

### 1b. NCSA Kerberos Password
This is **separate** from your university password. Set it at:

https://identity.ncsa.illinois.edu/reset

Enter your NCSA username and follow the email verification flow.

### 1c. NCSA Duo MFA
You need a second factor for every login. The easiest method:

1. Go to https://duo.security.ncsa.illinois.edu
2. Generate **emergency backup recovery codes**
3. Save these codes somewhere safe — you'll type one each time you SSH in

Alternatively, install the Duo Mobile app and enroll your phone.

---

## Step 2: SSH In

```bash
ssh YOUR_USERNAME@dtai-login.delta.ncsa.illinois.edu
```

You'll be prompted for:
1. Your NCSA Kerberos password
2. A Duo passcode (type a recovery code or `1` for a push notification)

### Pro tip: Use tmux for persistent sessions

```bash
# After logging in, immediately start tmux
tmux new -s work

# If you disconnect, reconnect with:
ssh YOUR_USERNAME@gh-login04.delta.ncsa.illinois.edu  # same login node!
tmux attach -t work
```

### SSH config shortcut

Add this to your `~/.ssh/config`:
```
Host delta-ai
    HostName dtai-login.delta.ncsa.illinois.edu
    User YOUR_USERNAME
    PreferredAuthentications keyboard-interactive,password
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

Then just: `ssh delta-ai`

---

## Step 3: Understand Your Storage

| Path | Quota | Use For |
|------|-------|---------|
| `/u/YOUR_USERNAME` | ~100 GB | Dotfiles, scripts, small configs |
| `/work/hdd/bekn/YOUR_USERNAME/` | 1 TB | **Your primary workspace** — code, builds, data |
| `/work/nvme/bekn/` | 500 GB | Fast I/O scratch (shared across team) |
| `/projects/bekn/` | 500 GB | Shared project files |
| `/tmp` | 3.9 TB | Compute-node-local scratch (deleted after your job ends) |

**Rule of thumb:** Do everything in `/work/hdd/bekn/YOUR_USERNAME/`. Home is too small for builds.

Check your quota: `quota`

---

## Step 4: Run Your First Job

### Interactive session (for exploration)

```bash
srun --account=bekn-dtai-gh --partition=ghx4-interactive \
  --nodes=1 --gpus-per-node=1 --cpus-per-task=16 \
  --mem=64G --time=00:30:00 --pty bash
```

This gives you a shell on a compute node with 1 GPU for 30 minutes.

Once on the compute node:
```bash
nvidia-smi          # See your GPU (GH200 120GB)
uname -m            # Should print "aarch64"
```

### Batch job

Create `job.slurm`:
```bash
#!/bin/bash
#SBATCH --account=bekn-dtai-gh
#SBATCH --partition=ghx4
#SBATCH --nodes=1
#SBATCH --gpus-per-node=1
#SBATCH --cpus-per-task=16
#SBATCH --mem=64G
#SBATCH --time=01:00:00
#SBATCH --job-name=my-experiment
#SBATCH --output=logs/%j.out
#SBATCH --error=logs/%j.err

# Load your environment
source ~/miniconda3/etc/profile.d/conda.sh
conda activate myenv

# Run your code
srun python train.py
```

Submit: `sbatch job.slurm`
Check status: `squeue -u $USER`
Cancel: `scancel JOB_ID`

### Cost awareness

| Action | Cost |
|--------|------|
| 1 GPU for 1 hour (batch) | 1 GPU Hour |
| 1 GPU for 1 hour (interactive) | **2 GPU Hours** |
| Full node (4 GPUs) for 1 hour | 4 GPU Hours |

We have ~1,000 GPU Hours. Use interactive sessions for debugging, batch for real work.

---

### Interactive job

```
  srun --account=bekn-delta-cpu \
       --partition=cpu-interactive \
       --nodes=1 \
       --ntasks=1 \
       --cpus-per-task=8 \
       --time=01:00:00 \
       --pty bash
```

## Step 5: Install IOWarp

Install iowarp using any of the methods described in the installation guide.
You can do this on an interactive node.
Avoid building on the head nodes.

## Step 6 (Optional): Install AI Coding Agents

DeltaAI does not ship with Node.js. If you want to use terminal-based coding agents, install Node.js first via [nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts
```

Then install whichever agents your workflow requires:

<details>
<summary><strong>Claude Code</strong> (Anthropic)</summary>

```bash
npm install -g @anthropic-ai/claude-code
```

Requires an Anthropic API key or a Claude Pro/Max subscription. See [claude.ai/code](https://claude.ai/code) for details.

</details>

<details>
<summary><strong>Gemini CLI</strong> (Google)</summary>

```bash
npm install -g @google/gemini-cli
```

Authenticate with your Google account on first run. See [geminicli.com](https://geminicli.com/docs/) for details.

</details>

<details>
<summary><strong>Codex CLI</strong> (OpenAI)</summary>

```bash
npm install -g @openai/codex
```

Requires an OpenAI API key. See [openai.com/codex](https://developers.openai.com/codex/cli/) for details.

</details>

<details>
<summary><strong>OpenCode</strong></summary>

```bash
npm install -g opencode-ai@latest
```

Supports multiple LLM providers. See [opencode.ai](https://opencode.ai/docs/) for details.

</details>

:::tip
All of these agents work well inside a `tmux` session, which is especially useful on DeltaAI where SSH sessions require re-authentication.
:::

---

## Key Things to Remember

1. **This is ARM, not x86.** Binaries from your laptop won't run here. Compile everything on DeltaAI.
2. **No `mpirun`.** Use `srun` for everything.
3. **Use `gcc-13`/`g++-13` explicitly.** The default system GCC is 7.5 (too old).
4. **No SSH keys.** Password + Duo every time. Use tmux.
5. **Interactive = 2x cost.** Use batch jobs for anything longer than quick debugging.
6. **No backups on `/work`.** Only HOME has snapshots. Back up important work yourself.
7. **Keep builds off HOME.** Use `/work/hdd/bekn/YOUR_USERNAME/` for everything.

---

## Useful Commands Cheat Sheet

```bash
accounts                          # Check GPU hour balance
quota                             # Check storage usage
sinfo -a                          # See partition status
squeue -u $USER                   # Your running/queued jobs
scancel JOB_ID                    # Cancel a job
nvidia-smi                        # GPU status (compute nodes only)
module list                       # Loaded software modules
module spider PACKAGE             # Search for available software
```

## GPU Info

- NVIDIA GH200 120GB per superchip
- 4 superchips per node (4 GPUs)
- CUDA 12.8, Driver 570.172
- SM architecture: 9.0 (Hopper)
- Use `nvidia-smi` on compute nodes (no GPUs on login nodes)

## Getting Help

- **NCSA Support:** http://help.ncsa.illinois.edu or email help@ncsa.illinois.edu
- **DeltaAI Docs:** https://docs.ncsa.illinois.edu/systems/deltaai/en/latest/
- **Team Slack/Chat:** Ask the PI or allocation managers (Jaime, Luke)

## Required Acknowledgment

If you publish results using DeltaAI, include:

> "This research used the DeltaAI system at the National Center for Supercomputing Applications through allocation CIS250329 from the ACCESS program, supported by NSF award OAC 2320345."
