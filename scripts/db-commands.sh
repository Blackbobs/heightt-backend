#!/bin/bash

# Database management scripts
case "$1" in
  start)
    echo "Starting database..."
    docker compose up -d postgres
    ;;
  stop)
    echo "Stopping database..."
    docker compose stop postgres
    ;;
  restart)
    echo "Restarting database..."
    docker compose restart postgres
    ;;
  status)
    echo "Database status:"
    docker compose ps postgres
    ;;
  logs)
    echo "Showing database logs..."
    docker compose logs -f postgres
    ;;
  shell)
    echo "Opening database shell..."
    docker exec -it heightt-postgres psql -U postgres -d heightt_db
    ;;
  reset)
    echo "WARNING: This will delete all data! Continue? (y/N)"
    read -r confirm
    if [[ $confirm == "y" || $confirm == "Y" ]]; then
      docker compose down -v
      docker compose up -d
      echo "Database reset complete."
    else
      echo "Reset cancelled."
    fi
    ;;
  backup)
    echo "Creating backup..."
    mkdir -p ./backups
    docker exec heightt-postgres pg_dump -U postgres heightt_db > "./backups/backup_$(date +%Y%m%d_%H%M%S).sql"
    echo "Backup created successfully."
    ;;
  restore)
    echo "Restoring database from backup file: $2"
    if [[ -f "$2" ]]; then
      cat "$2" | docker exec -i heightt-postgres psql -U postgres -d heightt_db
      echo "Restore completed."
    else
      echo "Backup file not found: $2"
    fi
    ;;
  *)
    echo "Usage: ./scripts/db-commands.sh {start|stop|restart|status|logs|shell|reset|backup|restore backup.sql}"
    exit 1
    ;;
esac