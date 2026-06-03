Set-Location -Path $PSScriptRoot\..

Write-Host "Iniciando backend de produção com Docker Compose..."

docker compose -f docker-compose.prod.yml up -d --build

docker compose -f docker-compose.prod.yml ps

Write-Host "Backend de produção em execução. Use 'docker compose -f docker-compose.prod.yml logs -f backend' para ver os logs."