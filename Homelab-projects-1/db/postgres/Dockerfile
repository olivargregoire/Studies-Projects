# 1. Use the official Postgres image (Alpine version is lighter)
FROM postgres:16-alpine

# 2. (Optional) Set environment variables 
# Note: It's better to do this in docker-compose for security
ENV POSTGRES_DB=my_database
ENV POSTGRES_USER=greg
ENV POSTGRES_PASSWORD=password123

# 3. (Optional) Add initialization scripts
# Any .sql or .sh script placed in this folder is executed 
# ONLY the first time the volume is created.
COPY init.sql /docker-entrypoint-initdb.d/

# 4. Postgres traditionally listens on 5432
EXPOSE 5432