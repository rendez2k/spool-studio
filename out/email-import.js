document.getElementById('copy-email-prompt').onclick=async()=>{
 const prompt=document.getElementById('email-prompt'),status=document.getElementById('copy-prompt-status');
 try{await navigator.clipboard.writeText(prompt.value);status.textContent='Copied. Paste into ChatGPT, set your date range and supply the selected emails.';}
 catch{prompt.focus();prompt.select();status.textContent='Automatic copy is unavailable. The prompt is selected—copy it manually.';}
};
