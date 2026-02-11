# Storm Scout - Quick Deploy Guide

Deploy Storm Scout from your Mac to your server with one command!

## First Time Setup

### 1. Configure Deployment

Edit `.deploy.config.local` with your server details:

```bash
export DEPLOY_HOST="your-domain.example.com"
export DEPLOY_USER="REDACTED_USER"
export DEPLOY_BACKEND_PATH="~/storm-scout"
export DEPLOY_FRONTEND_PATH="~/public_html"
```

### 2. Test SSH Connection

Make sure you can SSH into your server:

```bash
ssh REDACTED_USER@your-domain.example.com
```

If using a specific SSH key, configure it in `~/.ssh/config`:

```
Host your-domain.example.com
    User REDACTED_USER
    IdentityFile ~/.ssh/id_ed25519_deploy
```

## Deploy

### One Command Deploy:

```bash
./deploy.sh
```

Or if you have configuration in `.deploy.config.local`:

```bash
source .deploy.config.local && ./deploy.sh
```

### What Happens:

1. ✅ Checks SSH connection
2. ✅ Syncs backend files (excludes node_modules, .env, .db)
3. ✅ Syncs frontend files
4. ✅ Installs npm dependencies on server
5. ✅ Initializes database (if needed)
6. ✅ Prompts you to restart Node.js app in cPanel

## Manual Deployment (Alternative)

If the script doesn't work, deploy manually:

### Backend:
```bash
rsync -avz --exclude 'node_modules/' --exclude '*.db*' --exclude '.env' \
  ./backend/ REDACTED_USER@your-domain.example.com:~/storm-scout/

ssh REDACTED_USER@your-domain.example.com "cd ~/storm-scout && source ~/nodevenv/storm-scout/20/bin/activate && npm install --production"
```

### Frontend:
```bash
rsync -avz ./frontend/ REDACTED_USER@your-domain.example.com:~/public_html/
```

### Restart:
Go to cPanel → Node.js → Restart "storm-scout" app

## Troubleshooting

### SSH Connection Fails
- Check `DEPLOY_HOST` and `DEPLOY_USER` in `.deploy.config.local`
- Verify SSH key: `ssh -i ~/.ssh/id_ed25519_deploy REDACTED_USER@your-domain.example.com`
- Check `~/.ssh/config` for host configuration

### rsync: command not found
Make sure rsync is installed:
```bash
brew install rsync
```

### Permission Denied
- Check file permissions on server
- Verify you have write access to `~/storm-scout` and `~/public_html`

### Database Not Initializing
Manually initialize on server:
```bash
ssh REDACTED_USER@your-domain.example.com
cd ~/storm-scout
source ~/nodevenv/storm-scout/20/bin/activate
npm run init-db
npm run seed-db
```

## Environment Variables

Set these before running `deploy.sh`:

```bash
export DEPLOY_HOST="your-server.com"
export DEPLOY_USER="username"
./deploy.sh
```

Or add to your shell profile (`~/.zshrc` or `~/.bash_profile`):

```bash
source ~/path/to/strom-scout/.deploy.config.local
```

## After Deployment

1. ✅ Check backend: `curl https://your-domain.example.com/health`
2. ✅ Check frontend: Open https://your-domain.example.com
3. ✅ Verify data: Check dashboard shows sites and advisories

## Tips

- **Test locally first**: Always test changes locally before deploying
- **Commit before deploy**: Make sure changes are committed to git
- **Backup database**: Copy `storm-scout.db` before major updates
- **Check logs**: If issues occur, check logs in cPanel

---

**Questions?** Check the main deployment guides:
- `DEPLOYMENT.md` - Full VPS deployment guide
- `DEPLOYMENT-CPANEL.md` - cPanel-specific guide
