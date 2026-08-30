# syntax=docker/dockerfile:1

FROM docker.io/library/nginx:1-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html

EXPOSE 80
