import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

const API_BASE = 'http://localhost:8000/api/auth';

/**
 * Fluxo de Registro de Conta
 */
export async function register(displayName, deviceName) {
  // 1. Solicita as opções de registro e o challenge ao backend
  const startRes = await fetch(`${API_BASE}/register/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: displayName, device_name: deviceName })
  });
  
  if (!startRes.ok) throw new Error('Falha ao iniciar registro.');
  const { session_id, options } = await startRes.json();

  // 2. Aciona o hardware do dispositivo via API WebAuthn nativa do navegador
  const attResp = await startRegistration({ optionsJSON: options });

  // 3. Envia a assinatura/resposta do hardware para validação final no servidor
  const finishRes = await fetch(`${API_BASE}/register/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id,
      display_name: displayName,
      device_name: deviceName,
      webauthn_response: attResp
    })
  });

  const data = await finishRes.json();
  if (!finishRes.ok) throw new Error(data.detail || 'Erro ao finalizar registro');

  localStorage.setItem('access_token', data.access_token);
  return data;
}

/**
 * Fluxo de Login sem Senha
 */
export async function login() {
  // 1. Obtém o challenge para autenticação
  const startRes = await fetch(`${API_BASE}/login/start`, { method: 'POST' });
  if (!startRes.ok) throw new Error('Falha ao iniciar autenticação.');
  
  const { session_id, options } = await startRes.json();

  // 2. Solicita autenticação via Biometria/Chave de Segurança local
  const assertionResp = await startAuthentication({ optionsJSON: options });

  // 3. Envia a prova criptográfica ao backend
  const finishRes = await fetch(`${API_BASE}/login/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id,
      webauthn_response: assertionResp
    })
  });

  const data = await finishRes.json();
  if (!finishRes.ok) throw new Error(data.detail || 'Erro ao realizar login');

  localStorage.setItem('access_token', data.access_token);
  return data;
}

/**
 * Adicionar Novo Dispositivo a uma Conta Autenticada
 */
export async function addDevice(deviceName) {
  const token = localStorage.getItem('access_token');
  
  const startRes = await fetch(`${API_BASE}/passkeys/add/start`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ device_name: deviceName })
  });

  const { session_id, options } = await startRes.json();
  const attResp = await startRegistration({ optionsJSON: options });

  const finishRes = await fetch(`${API_BASE}/passkeys/add/finish`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      session_id,
      display_name: '',
      device_name: deviceName,
      webauthn_response: attResp
    })
  });

  return await finishRes.json();
}

/**
 * Carrega Perfil do Usuário e todo seu Progresso do PostgreSQL
 */
export async function fetchProfile() {
  const token = localStorage.getItem('access_token');
  if (!token) return null;

  const res = await fetch(`${API_BASE}/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!res.ok) {
    localStorage.removeItem('access_token');
    return null;
  }

  return await res.json();
}