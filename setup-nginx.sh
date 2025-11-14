#!/bin/bash

# Nginx Setup Script for Numenor Security
# This script helps set up SSL certificates and nginx configuration

set -e

echo "🔒 Nginx SSL Certificate Setup"
echo "=============================="
echo ""

# Check if ssl directory exists
if [ ! -d "ssl" ]; then
    echo "📁 Creating ssl directory..."
    mkdir -p ssl
fi

# Check if certificates already exist
if [ -f "ssl/cert.pem" ] && [ -f "ssl/key.pem" ]; then
    echo "✅ SSL certificates already exist in ssl/"
    echo ""
    read -p "Do you want to generate new certificates? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Using existing certificates."
        exit 0
    fi
fi

echo "Choose certificate type:"
echo "1) Self-signed (for development/testing)"
echo "2) Let's Encrypt (for production)"
echo "3) Use existing certificates"
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        echo ""
        echo "🔐 Generating self-signed certificate..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout ssl/key.pem \
            -out ssl/cert.pem \
            -subj "/C=US/ST=State/L=City/O=Numenor Security/CN=numenorsecurity.com"
        
        chmod 600 ssl/key.pem
        chmod 644 ssl/cert.pem
        
        echo "✅ Self-signed certificate generated!"
        echo "⚠️  Note: Browsers will show a security warning for self-signed certificates."
        echo "   This is normal for development. Accept the warning to proceed."
        ;;
    2)
        echo ""
        echo "📋 Let's Encrypt Setup Instructions:"
        echo ""
        echo "1. Ensure your domain (numenorsecurity.com) points to this server"
        echo "2. Install certbot:"
        echo "   sudo apt-get update && sudo apt-get install certbot"
        echo ""
        echo "3. Get certificates:"
        echo "   sudo certbot certonly --standalone -d numenorsecurity.com"
        echo ""
        echo "4. Copy certificates to ssl directory:"
        echo "   sudo cp /etc/letsencrypt/live/numenorsecurity.com/fullchain.pem ssl/cert.pem"
        echo "   sudo cp /etc/letsencrypt/live/numenorsecurity.com/privkey.pem ssl/key.pem"
        echo "   sudo chmod 644 ssl/cert.pem"
        echo "   sudo chmod 600 ssl/key.pem"
        echo ""
        echo "5. Set up auto-renewal (add to crontab):"
        echo "   0 0 * * * certbot renew --quiet --deploy-hook 'docker restart numenor-nginx'"
        ;;
    3)
        echo ""
        read -p "Enter path to certificate file: " cert_path
        read -p "Enter path to private key file: " key_path
        
        if [ ! -f "$cert_path" ] || [ ! -f "$key_path" ]; then
            echo "❌ Error: Certificate files not found!"
            exit 1
        fi
        
        cp "$cert_path" ssl/cert.pem
        cp "$key_path" ssl/key.pem
        chmod 644 ssl/cert.pem
        chmod 600 ssl/key.pem
        
        echo "✅ Certificates copied to ssl/"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Review nginx.conf configuration"
echo "2. Start services: docker-compose -f docker-compose.prod.yml up -d"
echo "3. Test HTTPS: curl -k https://localhost/health"
echo ""
echo "For detailed instructions, see NGINX_SETUP.md"

