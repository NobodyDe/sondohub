# O "um clique": compila as imagens no seu PC, envia para o GHCR e manda a VM atualizar.
# Rode da raiz do repositório:  .\deploy\deploy.ps1 -Server usuario@ip-da-vm
#Requires -Version 7.3
param([Parameter(Mandatory)] [string]$Server)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true # build quebrou? Para aqui, antes de enviar imagem velha.

$compose = "deploy/docker-compose.yml"

docker compose -f $compose build
docker compose -f $compose push
scp $compose "${Server}:/opt/sondohub/docker-compose.yml"
# --wait: só termina quando a api responde ao healthcheck; se ela não subir, o comando falha aqui.
ssh $Server "cd /opt/sondohub && docker compose pull && docker compose up -d --wait"
