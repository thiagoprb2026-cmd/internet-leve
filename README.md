# Leve — versão para internet

Esta pasta contém o aplicativo web e o servidor de sinalização. Os participantes acessam o mesmo endereço público e compartilham o link da sala.

## O que está incluído
- Salas com código de 6 caracteres e limite de 6 participantes.
- Chat e sinalização WebRTC em tempo real.
- Áudio, vídeo e compartilhamento de tela.
- Link de convite com o código da sala no fragmento (`#CODIGO`).
- Endpoint `/health` para verificar o servidor.

## Publicar na internet (Render)
1. Crie uma conta em https://render.com e um repositório Git com todos os arquivos desta pasta.
2. No Render, crie um serviço **Web Service** conectado ao repositório.
3. Configure:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Publique. O Render fornecerá um endereço HTTPS, por exemplo `https://seu-leve.onrender.com`.
5. Abra esse endereço, crie uma sala e compartilhe o convite. Seus amigos abrem o mesmo link em seus dispositivos.

Também é possível executar localmente com Node.js 20+: `npm start`, depois abrir `http://localhost:3000`.

## Importante sobre áudio e vídeo entre redes diferentes
O servidor deste projeto coordena a conexão e hospeda o site; o áudio/vídeo usa WebRTC entre os navegadores. O código inclui STUN público para conexões comuns. Algumas redes, operadoras e firewalls exigem um servidor TURN para retransmitir mídia. Para maior confiabilidade, configure credenciais de um provedor TURN e injete no `public/index.html` antes do script principal, por exemplo:

```html
<script>
window.LEVE_ICE_SERVERS = [
  { urls: "stun:SEU_SERVIDOR_STUN:3478" },
  {
    urls: "turn:SEU_SERVIDOR_TURN:3478",
    username: "USUARIO_TURN",
    credential: "SENHA_TURN"
  }
];
</script>
```

Use credenciais TURN temporárias/rotativas fornecidas pelo provedor; não publique uma senha permanente no repositório.

## Limitações e próximos passos
- O servidor guarda as salas em memória. Reiniciar ou suspender o serviço encerra as salas ativas.
- Serviços gratuitos podem suspender o servidor quando inativo; a primeira abertura pode demorar.
- A mídia em grupo usa conexões diretas entre participantes (mesh), então qualidade e consumo de banda variam conforme a conexão e o número de pessoas.
- Para uso público/produção, recomenda-se adicionar autenticação, proteção contra abuso, TURN gerenciado e um servidor de mídia SFU para grupos maiores.
- Permissões de microfone/câmera e compartilhamento de tela dependem do navegador e de HTTPS (localhost é exceção).
