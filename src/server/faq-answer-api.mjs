import {body,endpoint,fail,send,textField} from './publication-core.mjs';
// Deterministic search in published, reviewed content. No model, external send or promise.
export function createFaqAnswerApi({pool,sameOrigin}) {
  return endpoint(async(req,res)=>{
    if(req.method!=='POST')fail(405,'method_not_allowed');
    if(!sameOrigin(req))fail(403,'same_origin_required');
    const b=await body(req),question=textField(b.question,5,1000,'question');
    const sensitive=/pre[cç]o|valor|custa|cobertura|licen[cç]a|prazo|garant|armad/i.test(question);
    const terms=question.toLocaleLowerCase('pt-BR').split(/[^\p{L}\p{N}]+/u).filter(x=>x.length>3);
    const rows=(await pool.query("SELECT slug,title,content FROM cms_contents WHERE content_type='faq' AND is_published AND status='publicado' ORDER BY published_at DESC LIMIT 100")).rows;
    const match=!sensitive&&rows.find(r=>terms.filter(t=>(r.title+' '+r.content).toLocaleLowerCase('pt-BR').includes(t)).length>=2);
    send(res,200,{answer:match?match.content:'Nossa equipe precisa avaliar essa solicitação. Envie seus dados no formulário de contato para receber um protocolo de atendimento.',source:match?'/conteudos/'+match.slug:null,need_handoff:!match,handoff_url:'/contato?origin=faq',note:'O atendimento humano é registrado somente após enviar o formulário com consentimento.'});
  });
}
