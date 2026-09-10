export function gmailConfig(user, config={}) {
 const valid=/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(config.clientId||'');
 const testing=(config.testUsers||'').split(',').map(value=>value.trim()).includes(user);
 const enabled=valid&&(config.publicEnabled===true||testing);
 return {enabled,clientId:enabled?config.clientId:'',testing:enabled&&config.publicEnabled!==true};
}
