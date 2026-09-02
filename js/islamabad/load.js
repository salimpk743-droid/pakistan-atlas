(function(){
  var spec={1:5,2:5,3:4,4:6,5:6,6:5,7:11};
  var i,c;
  for(i=1;i<=7;i++){
    for(c=0;c<spec[i];c++){
      document.write('<script src="js/islamabad/p'+i+'-'+c+'.js"><\/script>');
    }
    document.write('<script src="js/islamabad/p'+i+'.js"><\/script>');
  }
})();
