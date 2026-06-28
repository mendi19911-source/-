FROM php:8.3-cli
RUN docker-php-ext-install curl
WORKDIR /app
COPY chat.php .
EXPOSE 8080
CMD ["php", "-S", "0.0.0.0:8080", "chat.php"]
