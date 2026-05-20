FROM supercorp/supergateway:latest

COPY docker/start-mcp-server.mjs /usr/local/bin/start-mcp-server.mjs

ENTRYPOINT ["node", "/usr/local/bin/start-mcp-server.mjs"]
CMD ["--help"]
