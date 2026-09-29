# Git & GitHub Tutorial

A simple guide to get you started with Git (version control) and GitHub (remote hosting).

## 1. What's the Difference?

- **Git**: A tool installed on your computer that tracks changes to your files over time.
- **GitHub**: A website that hosts your Git repositories online, so you can back them up and collaborate with others.

## 2. One-Time Setup

Check if Git is installed:

```bash
git --version
```

Set your identity (used in every commit you make):

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## 3. Starting a Project

**Option A — Start from scratch locally:**

```bash
cd my-project
git init
```

**Option B — Copy an existing GitHub repo:**

```bash
git clone https://github.com/username/repo-name.git
```

## 4. The Basic Workflow

This is the cycle you'll repeat constantly:

```bash
git status              # see what's changed
git add <file>          # stage a specific file
git add .                # stage everything changed
git commit -m "message"  # save a snapshot with a description
```

### Example

```bash
git status
git add README.md
git commit -m "Add project description"
```

## 5. Connecting to GitHub

1. Create a new (empty) repository on [github.com](https://github.com).
2. Link your local project to it:

```bash
git remote add origin https://github.com/username/repo-name.git
```

3. Push your commits up:

```bash
git push -u origin main
```

After the first push, you can just run `git push` for future updates.

## 6. Getting Updates

Pull down changes from GitHub (e.g., made by teammates or on another device):

```bash
git pull
```

## 7. Branches

Branches let you work on something new without affecting the main code.

```bash
git branch                # list branches
git checkout -b feature-x  # create and switch to a new branch
git checkout main          # switch back to main
git merge feature-x        # merge feature-x into your current branch
```

## 8. Checking History

```bash
git log                # full commit history
git log --oneline      # compact view
git diff               # see unstaged changes
```

## 9. Undoing Things

```bash
git restore <file>              # discard unstaged changes to a file
git reset HEAD~1                # undo the last commit, keep the changes
git checkout <commit-hash> -- <file>   # restore a file from an old commit
```

## 10. Typical Day-to-Day Flow

```bash
git pull                        # get the latest changes
# ... make your edits ...
git add .
git commit -m "Describe what you changed"
git push
```

## Quick Reference

| Command | What it does |
|---|---|
| `git init` | Start tracking a folder with Git |
| `git clone <url>` | Copy a remote repo to your computer |
| `git status` | Show changed/staged files |
| `git add <file>` | Stage a file for commit |
| `git commit -m "msg"` | Save a snapshot of staged changes |
| `git push` | Upload commits to GitHub |
| `git pull` | Download changes from GitHub |
| `git branch` | List/create branches |
| `git checkout -b <name>` | Create and switch to a new branch |
| `git merge <branch>` | Combine a branch into the current one |
| `git log` | View commit history |
