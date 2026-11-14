-- Paleta Vista Verde: cores das categorias em tons terrosos (combinam com o fundo creme).
update public.categories set color = case key
  when 'custos_fixos'         then '#1F3D2E'
  when 'conforto'             then '#6F9A78'
  when 'metas'                then '#B8996A'
  when 'prazeres'             then '#B5654A'
  when 'liberdade_financeira' then '#2F5D6E'
  when 'conhecimento'         then '#8A7A3E'
  else color
end;
