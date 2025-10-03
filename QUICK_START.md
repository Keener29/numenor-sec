# Quick Start Guide

Get Numenor Security running in 5 minutes with Docker!

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) installed
- Git

## 🚀 5-Minute Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd clicksafe
```

### 2. Copy Environment Variables
```bash
cp docker.env.example .env
```

### 3. Start the Application
```bash
docker-compose up -d
```

### 4. Access the Application
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **API**: [http://localhost:3001](http://localhost:3001)

That's it! 🎉

## What's Running

Your application now includes:
- ✅ **Frontend**: React Router app with dashboard, login, signup
- ✅ **API**: Express.js server with authentication and email monitoring
- ✅ **Database**: PostgreSQL with automatic schema setup
- ✅ **Cache**: Redis for session storage and caching
- ✅ **Health Checks**: All services monitored automatically

## First Steps

1. **Visit the Frontend**: Go to [http://localhost:3000](http://localhost:3000)
2. **Create an Account**: Click "Sign Up" and create a business account
3. **Add Email Monitoring**: Use the dashboard to add email addresses
4. **Test Email Permissions**: The system will send permission request emails

## Development Commands

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f api
docker-compose logs -f frontend

# Stop the application
docker-compose down

# Restart after code changes
docker-compose up --build -d

# Access the database
docker-compose exec postgres psql -U numenor_user -d numenor_security
```

## Troubleshooting

### Application Not Starting
```bash
# Check service status
docker-compose ps

# View logs for errors
docker-compose logs
```

### Database Issues
```bash
# Reset database (WARNING: This will delete all data)
docker-compose down -v
docker-compose up -d
```

### Port Conflicts
If ports 3000 or 3001 are already in use:
```bash
# Check what's using the ports
lsof -i :3000
lsof -i :3001

# Stop conflicting services or modify docker-compose.yml
```

## Next Steps

- **Configure Email**: Edit `.env` file with your SMTP settings
- **Production Setup**: See `DOCKER_SETUP.md` for production deployment
- **API Documentation**: Visit [http://localhost:3001/api](http://localhost:3001/api)
- **Health Check**: Visit [http://localhost:3001/health](http://localhost:3001/health)

## Need Help?

- Check the [DOCKER_SETUP.md](DOCKER_SETUP.md) for detailed Docker configuration
- Review the [README.md](README.md) for complete documentation
- Check service logs: `docker-compose logs -f`

## Features Available

- 🔐 **User Authentication**: JWT-based login/signup
- 📧 **Email Monitoring**: Add and manage monitored email addresses
- 🛡️ **Permission System**: Secure email approval/decline workflow
- 📊 **Dashboard**: Real-time monitoring and statistics
- 🔍 **Security Events**: Comprehensive audit logging
- 📈 **Analytics**: Phishing alert tracking and trends
