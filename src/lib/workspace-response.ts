export async function workspaceResponse(response:Response){
 const data=await response.json();
 if(!response.ok){
  const reason=response.status===401?'Sua sessão expirou. Entre novamente.':response.status===403?'Seu acesso não permite esta operação.':response.status===404?'O registro não está disponível neste contexto.':response.status>=500?'O serviço está indisponível. Tente novamente.':'Confira os dados informados.';
  throw new Error(`${reason} (HTTP ${response.status}${data?.error?`, ${data.error}`:''})`);
 }
 return data;
}
export async function workspaceFetch(input:RequestInfo|URL,init?:RequestInit){
 const response=await fetch(input,init);
 if(!response.ok)await workspaceResponse(response);
 return response;
}
